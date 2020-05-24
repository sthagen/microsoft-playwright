/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
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

import { CRSession } from './crConnection';
import { helper } from '../helper';
import { valueFromRemoteObject, getExceptionMessage, releaseObject } from './crProtocolHelper';
import { Protocol } from './protocol';
import * as js from '../javascript';

export class CRExecutionContext implements js.ExecutionContextDelegate {
  _client: CRSession;
  _contextId: number;

  constructor(client: CRSession, contextPayload: Protocol.Runtime.ExecutionContextDescription) {
    this._client = client;
    this._contextId = contextPayload.id;
  }

  async rawEvaluate(expression: string): Promise<js.RemoteObject> {
    const { exceptionDetails, result: remoteObject } = await this._client.send('Runtime.evaluate', {
      expression: js.ensureSourceUrl(expression),
      contextId: this._contextId,
    }).catch(rewriteError);
    if (exceptionDetails)
      throw new Error('Evaluation failed: ' + getExceptionMessage(exceptionDetails));
    return remoteObject;
  }

  async evaluate(context: js.ExecutionContext, returnByValue: boolean, pageFunction: Function | string, ...args: any[]): Promise<any> {
    if (helper.isString(pageFunction)) {
      return this._callOnUtilityScript(context,
          `evaluate`, [
            { value: js.ensureSourceUrl(pageFunction) },
          ], returnByValue, () => { });
    }

    if (typeof pageFunction !== 'function')
      throw new Error(`Expected to get |string| or |function| as the first argument, but got "${pageFunction}" instead.`);

    const { functionText, values, handles, dispose } = await js.prepareFunctionCall<Protocol.Runtime.CallArgument>(pageFunction, context, args, (value: any) => {
      if (typeof value === 'bigint') // eslint-disable-line valid-typeof
        return { handle: { unserializableValue: `${value.toString()}n` } };
      if (Object.is(value, -0))
        return { handle: { unserializableValue: '-0' } };
      if (Object.is(value, Infinity))
        return { handle: { unserializableValue: 'Infinity' } };
      if (Object.is(value, -Infinity))
        return { handle: { unserializableValue: '-Infinity' } };
      if (Object.is(value, NaN))
        return { handle: { unserializableValue: 'NaN' } };
      if (value && (value instanceof js.JSHandle)) {
        const remoteObject = toRemoteObject(value);
        if (remoteObject.unserializableValue)
          return { handle: { unserializableValue: remoteObject.unserializableValue } };
        if (!remoteObject.objectId)
          return { handle: { value: remoteObject.value } };
        return { handle: { objectId: remoteObject.objectId } };
      }
      return { value };
    });

    return this._callOnUtilityScript(context,
        'callFunction', [
          { value: functionText },
          ...values.map(value => ({ value })),
          ...handles,
        ], returnByValue, dispose);
  }

  private async _callOnUtilityScript(context: js.ExecutionContext, method: string, args: Protocol.Runtime.CallArgument[], returnByValue: boolean, dispose: () => void) {
    try {
      const utilityScript = await context.utilityScript();
      const { exceptionDetails, result: remoteObject } = await this._client.send('Runtime.callFunctionOn', {
        functionDeclaration: `function (...args) { return this.${method}(...args) }${js.generateSourceUrl()}`,
        objectId: utilityScript._remoteObject.objectId,
        arguments: [
          { value: returnByValue },
          ...args
        ],
        returnByValue,
        awaitPromise: true,
        userGesture: true
      }).catch(rewriteError);
      if (exceptionDetails)
        throw new Error('Evaluation failed: ' + getExceptionMessage(exceptionDetails));
      return returnByValue ? valueFromRemoteObject(remoteObject) : context.createHandle(remoteObject);
    } finally {
      dispose();
    }
  }

  async getProperties(handle: js.JSHandle): Promise<Map<string, js.JSHandle>> {
    const objectId = toRemoteObject(handle).objectId;
    if (!objectId)
      return new Map();
    const response = await this._client.send('Runtime.getProperties', {
      objectId,
      ownProperties: true
    });
    const result = new Map();
    for (const property of response.result) {
      if (!property.enumerable)
        continue;
      result.set(property.name, handle._context.createHandle(property.value));
    }
    return result;
  }

  async releaseHandle(handle: js.JSHandle): Promise<void> {
    await releaseObject(this._client, toRemoteObject(handle));
  }

  async handleJSONValue<T>(handle: js.JSHandle<T>): Promise<T> {
    const remoteObject = toRemoteObject(handle);
    if (remoteObject.objectId) {
      const response = await this._client.send('Runtime.callFunctionOn', {
        functionDeclaration: 'function() { return this; }',
        objectId: remoteObject.objectId,
        returnByValue: true,
        awaitPromise: true,
      });
      return valueFromRemoteObject(response.result);
    }
    return valueFromRemoteObject(remoteObject);
  }

  handleToString(handle: js.JSHandle, includeType: boolean): string {
    const object = toRemoteObject(handle);
    if (object.objectId) {
      const type =  object.subtype || object.type;
      return 'JSHandle@' + type;
    }
    return (includeType ? 'JSHandle:' : '') + valueFromRemoteObject(object);
  }
}

function toRemoteObject(handle: js.JSHandle): Protocol.Runtime.RemoteObject {
  return handle._remoteObject as Protocol.Runtime.RemoteObject;
}

function rewriteError(error: Error): Protocol.Runtime.evaluateReturnValue {
  if (error.message.includes('Object reference chain is too long'))
    return {result: {type: 'undefined'}};
  if (error.message.includes('Object couldn\'t be returned by value'))
    return {result: {type: 'undefined'}};

  if (error.message.endsWith('Cannot find context with specified id') || error.message.endsWith('Inspected target navigated or closed') || error.message.endsWith('Execution context was destroyed.'))
    throw new Error('Execution context was destroyed, most likely because of a navigation.');
  if (error instanceof TypeError && error.message.startsWith('Converting circular structure to JSON'))
    error.message += ' Are you passing a nested JSHandle?';
  throw error;
}
