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

import { ElementHandle } from '../server/dom';
import * as js from '../server/javascript';
import * as channels from '../protocol/channels';
import { DispatcherScope, lookupNullableDispatcher } from './dispatcher';
import { JSHandleDispatcher, serializeResult, parseArgument } from './jsHandleDispatcher';
import { FrameDispatcher } from './frameDispatcher';

export function createHandle(scope: DispatcherScope, handle: js.JSHandle): JSHandleDispatcher {
  return handle.asElement() ? new ElementHandleDispatcher(scope, handle.asElement()!) : new JSHandleDispatcher(scope, handle);
}

export class ElementHandleDispatcher extends JSHandleDispatcher implements channels.ElementHandleChannel {
  readonly _elementHandle: ElementHandle;

  static createNullable(scope: DispatcherScope, handle: ElementHandle | null): ElementHandleDispatcher | undefined {
    if (!handle)
      return undefined;
    return new ElementHandleDispatcher(scope, handle);
  }

  constructor(scope: DispatcherScope, elementHandle: ElementHandle) {
    super(scope, elementHandle);
    this._elementHandle = elementHandle;
  }

  async ownerFrame(): Promise<channels.ElementHandleOwnerFrameResult> {
    return { frame: lookupNullableDispatcher<FrameDispatcher>(await this._elementHandle.ownerFrame()) };
  }

  async contentFrame(): Promise<channels.ElementHandleContentFrameResult> {
    return { frame: lookupNullableDispatcher<FrameDispatcher>(await this._elementHandle.contentFrame()) };
  }

  async getAttribute(params: channels.ElementHandleGetAttributeParams): Promise<channels.ElementHandleGetAttributeResult> {
    const value = await this._elementHandle.getAttribute(params.name);
    return { value: value === null ? undefined : value };
  }

  async textContent(): Promise<channels.ElementHandleTextContentResult> {
    const value = await this._elementHandle.textContent();
    return { value: value === null ? undefined : value };
  }

  async innerText(): Promise<channels.ElementHandleInnerTextResult> {
    return { value: await this._elementHandle.innerText() };
  }

  async innerHTML(): Promise<channels.ElementHandleInnerHTMLResult> {
    return { value: await this._elementHandle.innerHTML() };
  }

  async dispatchEvent(params: channels.ElementHandleDispatchEventParams): Promise<void> {
    await this._elementHandle.dispatchEvent(params.type, parseArgument(params.eventInit));
  }

  async scrollIntoViewIfNeeded(params: channels.ElementHandleScrollIntoViewIfNeededParams): Promise<void> {
    await this._elementHandle.scrollIntoViewIfNeeded(params);
  }

  async hover(params: channels.ElementHandleHoverParams): Promise<void> {
    await this._elementHandle.hover(params);
  }

  async click(params: channels.ElementHandleClickParams): Promise<void> {
    await this._elementHandle.click(params);
  }

  async dblclick(params: channels.ElementHandleDblclickParams): Promise<void> {
    await this._elementHandle.dblclick(params);
  }

  async selectOption(params: channels.ElementHandleSelectOptionParams): Promise<channels.ElementHandleSelectOptionResult> {
    const elements = (params.elements || []).map(e => (e as ElementHandleDispatcher)._elementHandle);
    return { values: await this._elementHandle.selectOption(elements, params.options || [], params) };
  }

  async fill(params: channels.ElementHandleFillParams): Promise<void> {
    await this._elementHandle.fill(params.value, params);
  }

  async selectText(params: channels.ElementHandleSelectTextParams): Promise<void> {
    await this._elementHandle.selectText(params);
  }

  async setInputFiles(params: channels.ElementHandleSetInputFilesParams): Promise<void> {
    await this._elementHandle.setInputFiles(params.files, params);
  }

  async focus(): Promise<void> {
    await this._elementHandle.focus();
  }

  async type(params: channels.ElementHandleTypeParams): Promise<void> {
    await this._elementHandle.type(params.text, params);
  }

  async press(params: channels.ElementHandlePressParams): Promise<void> {
    await this._elementHandle.press(params.key, params);
  }

  async check(params: channels.ElementHandleCheckParams): Promise<void> {
    await this._elementHandle.check(params);
  }

  async uncheck(params: channels.ElementHandleUncheckParams): Promise<void> {
    await this._elementHandle.uncheck(params);
  }

  async boundingBox(): Promise<channels.ElementHandleBoundingBoxResult> {
    const value = await this._elementHandle.boundingBox();
    return { value: value || undefined };
  }

  async screenshot(params: channels.ElementHandleScreenshotParams): Promise<channels.ElementHandleScreenshotResult> {
    return { binary: (await this._elementHandle.screenshot(params)).toString('base64') };
  }

  async querySelector(params: channels.ElementHandleQuerySelectorParams): Promise<channels.ElementHandleQuerySelectorResult> {
    const handle = await this._elementHandle.$(params.selector);
    return { element: handle ? new ElementHandleDispatcher(this._scope, handle) : undefined };
  }

  async querySelectorAll(params: channels.ElementHandleQuerySelectorAllParams): Promise<channels.ElementHandleQuerySelectorAllResult> {
    const elements = await this._elementHandle.$$(params.selector);
    return { elements: elements.map(e => new ElementHandleDispatcher(this._scope, e)) };
  }

  async evalOnSelector(params: channels.ElementHandleEvalOnSelectorParams): Promise<channels.ElementHandleEvalOnSelectorResult> {
    return { value: serializeResult(await this._elementHandle._$evalExpression(params.selector, params.expression, params.isFunction, parseArgument(params.arg))) };
  }

  async evalOnSelectorAll(params: channels.ElementHandleEvalOnSelectorAllParams): Promise<channels.ElementHandleEvalOnSelectorAllResult> {
    return { value: serializeResult(await this._elementHandle._$$evalExpression(params.selector, params.expression, params.isFunction, parseArgument(params.arg))) };
  }

  async waitForElementState(params: channels.ElementHandleWaitForElementStateParams): Promise<void> {
    await this._elementHandle.waitForElementState(params.state, params);
  }

  async waitForSelector(params: channels.ElementHandleWaitForSelectorParams): Promise<channels.ElementHandleWaitForSelectorResult> {
    return { element: ElementHandleDispatcher.createNullable(this._scope, await this._elementHandle.waitForSelector(params.selector, params)) };
  }

  async createSelectorForTest(params: channels.ElementHandleCreateSelectorForTestParams): Promise<channels.ElementHandleCreateSelectorForTestResult> {
    return { value: await this._elementHandle._page.selectors._createSelector(params.name, this._elementHandle as ElementHandle<Element>) };
  }
}
