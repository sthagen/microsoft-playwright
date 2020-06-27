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

import { serializeAsCallArgument, parseEvaluationResultValue } from '../common/utilityScriptSerializers';

export default class UtilityScript {
  evaluate(returnByValue: boolean, expression: string) {
    const result = global.eval(expression);
    return returnByValue ? this._promiseAwareJsonValueNoThrow(result) : result;
  }

  callFunction(returnByValue: boolean, functionText: string, ...args: any[]) {
    const argCount = args[0] as number;
    const handles = args.slice(argCount + 1);
    const parameters = args.slice(1, argCount + 1).map(a => parseEvaluationResultValue(a, handles));
    const func = global.eval('(' + functionText + ')');
    const result = func(...parameters);
    return returnByValue ? this._promiseAwareJsonValueNoThrow(result) : result;
  }

  jsonValue(returnByValue: true, value: any) {
    // Special handling of undefined to work-around multi-step returnByValue handling in WebKit.
    if (Object.is(value, undefined))
      return undefined;
    return serializeAsCallArgument(value, (value: any) => ({ fallThrough: value }));
  }

  private _promiseAwareJsonValueNoThrow(value: any) {
    const safeJson = (value: any) => {
      try {
        return this.jsonValue(true, value);
      } catch (e) {
        return undefined;
      }
    };

    if (value && typeof value === 'object' && typeof value.then === 'function')
      return value.then(safeJson);
    return safeJson(value);
  }
}
