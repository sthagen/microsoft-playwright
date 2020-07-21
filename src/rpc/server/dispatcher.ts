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

import { EventEmitter } from 'events';
import { helper, debugAssert, assert } from '../../helper';
import { Channel } from '../channels';
import { serializeError } from '../serializers';

export const dispatcherSymbol = Symbol('dispatcher');

export function lookupDispatcher<DispatcherType>(object: any): DispatcherType {
  const result = object[dispatcherSymbol];
  debugAssert(result);
  return result;
}

export function existingDispatcher<DispatcherType>(object: any): DispatcherType {
  return object[dispatcherSymbol];
}

export function lookupNullableDispatcher<DispatcherType>(object: any | null): DispatcherType | undefined {
  return object ? lookupDispatcher(object) : undefined;
}

export class Dispatcher<Type, Initializer> extends EventEmitter implements Channel {
  private _connection: DispatcherConnection;
  private _isScope: boolean;
  // Parent is always "isScope".
  private _parent: Dispatcher<any, any> | undefined;
  // Only "isScope" channel owners have registered dispatchers inside.
  private _dispatchers = new Map<string, Dispatcher<any, any>>();

  readonly _guid: string;
  readonly _type: string;
  readonly _scope: Dispatcher<any, any>;
  _object: Type;

  constructor(parent: Dispatcher<any, any> | DispatcherConnection, object: Type, type: string, initializer: Initializer, isScope?: boolean, guid = type + '@' + helper.guid()) {
    super();

    this._connection = parent instanceof DispatcherConnection ? parent : parent._connection;
    this._isScope = !!isScope;
    this._parent = parent instanceof DispatcherConnection ? undefined : parent;
    this._scope = isScope ? this : this._parent!;

    assert(!this._connection._dispatchers.has(guid));
    this._connection._dispatchers.set(guid, this);
    if (this._parent) {
      assert(!this._parent._dispatchers.has(guid));
      this._parent._dispatchers.set(guid, this);
    }

    this._type = type;
    this._guid = guid;
    this._object = object;

    (object as any)[dispatcherSymbol] = this;
    if (this._parent)
      this._connection.sendMessageToClient(this._parent._guid, '__create__', { type, initializer, guid });
  }

  _dispatchEvent(method: string, params: Dispatcher<any, any> | any = {}) {
    this._connection.sendMessageToClient(this._guid, method, params);
  }

  _dispose() {
    assert(this._isScope);

    // Clean up from parent and connection.
    if (this._parent)
      this._parent._dispatchers.delete(this._guid);
    this._connection._dispatchers.delete(this._guid);

    // Dispose all children.
    for (const [guid, dispatcher] of [...this._dispatchers]) {
      if (dispatcher._isScope)
        dispatcher._dispose();
      else
        this._connection._dispatchers.delete(guid);
    }
    this._dispatchers.clear();
  }

  _debugScopeState(): any {
    return {
      _guid: this._guid,
      objects: this._isScope ? Array.from(this._dispatchers.values()).map(o => o._debugScopeState()) : undefined,
    };
  }
}

export type DispatcherScope = Dispatcher<any, any>;

class Root extends Dispatcher<{}, {}> {
  constructor(connection: DispatcherConnection) {
    super(connection, {}, '', {}, true, '');
  }
}

export class DispatcherConnection {
  readonly _dispatchers = new Map<string, Dispatcher<any, any>>();
  private _rootDispatcher: Root;
  onmessage = (message: object) => {};

  async sendMessageToClient(guid: string, method: string, params: any): Promise<any> {
    this.onmessage({ guid, method, params: this._replaceDispatchersWithGuids(params) });
  }

  constructor() {
    this._rootDispatcher = new Root(this);
  }

  rootDispatcher(): Dispatcher<any, any> {
    return this._rootDispatcher;
  }

  async dispatch(message: object) {
    const { id, guid, method, params } = message as any;
    const dispatcher = this._dispatchers.get(guid);
    if (!dispatcher) {
      this.onmessage({ id, error: serializeError(new Error('Target browser or context has been closed')) });
      return;
    }
    if (method === 'debugScopeState') {
      this.onmessage({ id, result: this._rootDispatcher._debugScopeState() });
      return;
    }
    try {
      const result = await (dispatcher as any)[method](this._replaceGuidsWithDispatchers(params));
      this.onmessage({ id, result: this._replaceDispatchersWithGuids(result) });
    } catch (e) {
      this.onmessage({ id, error: serializeError(e) });
    }
  }

  private _replaceDispatchersWithGuids(payload: any): any {
    if (!payload)
      return payload;
    if (payload instanceof Dispatcher)
      return { guid: payload._guid };
    if (Array.isArray(payload))
      return payload.map(p => this._replaceDispatchersWithGuids(p));
    if (typeof payload === 'object') {
      const result: any = {};
      for (const key of Object.keys(payload))
        result[key] = this._replaceDispatchersWithGuids(payload[key]);
      return result;
    }
    return payload;
  }

  private _replaceGuidsWithDispatchers(payload: any): any {
    if (!payload)
      return payload;
    if (Array.isArray(payload))
      return payload.map(p => this._replaceGuidsWithDispatchers(p));
    if (payload.guid && this._dispatchers.has(payload.guid))
      return this._dispatchers.get(payload.guid);
    if (typeof payload === 'object') {
      const result: any = {};
      for (const key of Object.keys(payload))
        result[key] = this._replaceGuidsWithDispatchers(payload[key]);
      return result;
    }
    return payload;
  }
}
