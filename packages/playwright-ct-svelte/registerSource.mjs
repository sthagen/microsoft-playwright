/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// This file is injected into the registry as text, no dependencies are allowed.

const registry = new Map();

export function register(components) {
  for (const [name, value] of Object.entries(components))
    registry.set(name, value);
}

window.playwrightMount = component => {
  if (!document.getElementById('root')) {
    const rootElement = document.createElement('div');
    rootElement.id = 'root';
    document.body.append(rootElement);
  }
  let componentCtor = registry.get(component.type);
  if (!componentCtor) {
    // Lookup by shorthand.
    for (const [name, value] of registry) {
      if (component.type.endsWith(`_${name}_svelte`)) {
        componentCtor = value;
        break;
      }
    }
  }

  if (!componentCtor)
    throw new Error(`Unregistered component: ${component.type}. Following components are registered: ${[...registry.keys()]}`);

  const wrapper = new componentCtor({
    target: document.getElementById('root'),
    props: component.options?.props,
  });

  for (const [key, listener] of Object.entries(component.options?.on || {}))
    wrapper.$on(key, event => listener(event.detail));
  return '#root > *';
};
