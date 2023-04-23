/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// @ts-check
// This file is injected into the registry as text, no dependencies are allowed.

import { render as __pwSolidRender, createComponent as __pwSolidCreateComponent } from 'solid-js/web';
import __pwH from 'solid-js/h';

/** @typedef {import('../playwright-ct-core/types/component').Component} Component */
/** @typedef {() => import('solid-js').JSX.Element} FrameworkComponent */

/** @type {Map<string, FrameworkComponent>} */
const __pwRegistry = new Map();

/**
 * @param {{[key: string]: FrameworkComponent}} components
 */
export function pwRegister(components) {
  for (const [name, value] of Object.entries(components))
    __pwRegistry.set(name, value);
}

function __pwCreateChild(child) {
  return typeof child === 'string' ? child : __pwCreateComponent(child);
}

/**
 * @param {Component} component
 */
function __pwCreateComponent(component) {
  if (typeof component !== 'object' || Array.isArray(component))
    return component;

  let Component = __pwRegistry.get(component.type);
  if (!Component) {
    // Lookup by shorthand.
    for (const [name, value] of __pwRegistry) {
      if (component.type.endsWith(`_${name}`)) {
        Component = value;
        break;
      }
    }
  }

  if (!Component && component.type[0].toUpperCase() === component.type[0])
    throw new Error(`Unregistered component: ${component.type}. Following components are registered: ${[...__pwRegistry.keys()]}`);

  if (component.kind !== 'jsx')
    throw new Error('Object mount notation is not supported');

  const children = component.children.reduce((/** @type {any[]} */ children, current) => {
    const child = __pwCreateChild(current);
    if (typeof child !== 'string' || !!child.trim())
      children.push(child);
    return children;
  }, []);

  if (!Component)
    return __pwH(component.type, component.props, children);

  return __pwSolidCreateComponent(Component, { ...component.props, children });
}

const __pwUnmountKey = Symbol('unmountKey');

window.playwrightMount = async (component, rootElement, hooksConfig) => {
  let App = () => __pwCreateComponent(component);
  for (const hook of window.__pw_hooks_before_mount || []) {
    const wrapper = await hook({ App, hooksConfig });
    if (wrapper)
      App = () => wrapper;
  }

  const unmount = __pwSolidRender(App, rootElement);
  rootElement[__pwUnmountKey] = unmount;

  for (const hook of window.__pw_hooks_after_mount || [])
    await hook({ hooksConfig });
};

window.playwrightUnmount = async rootElement => {
  const unmount = rootElement[__pwUnmountKey];
  if (!unmount)
    throw new Error('Component was not mounted');

  unmount();
};

window.playwrightUpdate = async (rootElement, component) => {
  window.playwrightUnmount(rootElement);
  window.playwrightMount(component, rootElement, {});
};
