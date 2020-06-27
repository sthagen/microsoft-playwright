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

import * as js from '../../javascript';
import { JSHandleChannel, JSHandleInitializer } from '../channels';
import { Dispatcher, DispatcherScope } from '../dispatcher';
import { ElementHandleDispatcher } from './elementHandlerDispatcher';
import { parseEvaluationResultValue, serializeAsCallArgument } from '../../common/utilityScriptSerializers';

export class JSHandleDispatcher extends Dispatcher<js.JSHandle, JSHandleInitializer> implements JSHandleChannel {

  constructor(scope: DispatcherScope, jsHandle: js.JSHandle) {
    super(scope, jsHandle, jsHandle.asElement() ? 'elementHandle' : 'jsHandle', {
      preview: jsHandle.toString(),
    });
  }

  async evaluateExpression(params: { expression: string, isFunction: boolean, arg: any }): Promise<any> {
    return this._object._evaluateExpression(params.expression, params.isFunction, true /* returnByValue */, parseArgument(params.arg));
  }

  async evaluateExpressionHandle(params: { expression: string, isFunction: boolean, arg: any}): Promise<JSHandleChannel> {
    const jsHandle = await this._object._evaluateExpression(params.expression, params.isFunction, false /* returnByValue */, parseArgument(params.arg));
    return ElementHandleDispatcher.from(this._scope, jsHandle);
  }

  async getPropertyList(): Promise<{ name: string, value: JSHandleChannel }[]> {
    const map = await this._object.getProperties();
    const result = [];
    for (const [name, value] of map)
      result.push({ name, value: new JSHandleDispatcher(this._scope, value) });
    return result;
  }

  async jsonValue(): Promise<any> {
    return this._object.jsonValue();
  }

  async dispose() {
    await this._object.dispose();
  }
}

export function parseArgument(arg: { value: any, guids: JSHandleDispatcher[] }): any {
  return convertDispatchersToObjects(parseEvaluationResultValue(arg.value, arg.guids));
}

export function serializeResult(arg: any): any {
  return serializeAsCallArgument(arg, value => ({ fallThrough: value }));
}

function convertDispatchersToObjects(arg: any): any {
  if (arg === null)
    return null;
  if (Array.isArray(arg))
    return arg.map(item => convertDispatchersToObjects(item));
  if (arg instanceof JSHandleDispatcher)
    return arg._object;
  if (typeof arg === 'object') {
    const result: any = {};
    for (const key of Object.keys(arg))
      result[key] = convertDispatchersToObjects(arg[key]);
    return result;
  }
  return arg;
}
