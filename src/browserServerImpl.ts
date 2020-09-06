/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License");
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

import { LaunchServerOptions } from './client/types';
import { BrowserTypeBase } from './server/browserType';
import * as ws from 'ws';
import { Browser } from './server/browser';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'ws';
import { Dispatcher, DispatcherScope, DispatcherConnection } from './dispatchers/dispatcher';
import { BrowserDispatcher } from './dispatchers/browserDispatcher';
import { BrowserContextDispatcher } from './dispatchers/browserContextDispatcher';
import * as channels from './protocol/channels';
import { BrowserServerLauncher, BrowserServer } from './client/browserType';
import { envObjectToArray } from './client/clientHelper';
import { createGuid } from './utils/utils';
import { SelectorsDispatcher } from './dispatchers/selectorsDispatcher';
import { Selectors } from './server/selectors';

export class BrowserServerLauncherImpl implements BrowserServerLauncher {
  private _browserType: BrowserTypeBase;

  constructor(browserType: BrowserTypeBase) {
    this._browserType = browserType;
  }

  async launchServer(options: LaunchServerOptions = {}): Promise<BrowserServerImpl> {
    const browser = await this._browserType.launch({
      ...options,
      ignoreDefaultArgs: Array.isArray(options.ignoreDefaultArgs) ? options.ignoreDefaultArgs : undefined,
      ignoreAllDefaultArgs: !!options.ignoreDefaultArgs && !Array.isArray(options.ignoreDefaultArgs),
      env: options.env ? envObjectToArray(options.env) : undefined,
    });
    return new BrowserServerImpl(this._browserType, browser, options.port);
  }
}

export class BrowserServerImpl extends EventEmitter implements BrowserServer {
  private _server: ws.Server;
  private _browserType: BrowserTypeBase;
  private _browser: Browser;
  private _wsEndpoint: string;
  private _process: ChildProcess;

  constructor(browserType: BrowserTypeBase, browser: Browser, port: number = 0) {
    super();

    this._browserType = browserType;
    this._browser = browser;

    const token = createGuid();
    this._server = new ws.Server({ port });
    const address = this._server.address();
    this._wsEndpoint = typeof address === 'string' ? `${address}/${token}` : `ws://127.0.0.1:${address.port}/${token}`;
    this._process = browser._options.browserProcess.process;

    this._server.on('connection', (socket: ws, req) => {
      if (req.url !== '/' + token) {
        socket.close();
        return;
      }
      this._clientAttached(socket);
    });

    browser._options.browserProcess.onclose = (exitCode, signal) => {
      this._server.close();
      this.emit('close', exitCode, signal);
    };
  }

  process(): ChildProcess {
    return this._process;
  }

  wsEndpoint(): string {
    return this._wsEndpoint;
  }

  async close(): Promise<void> {
    await this._browser._options.browserProcess.close();
  }

  async kill(): Promise<void> {
    await this._browser._options.browserProcess.kill();
  }

  private _clientAttached(socket: ws) {
    const connection = new DispatcherConnection();
    connection.onmessage = message => {
      if (socket.readyState !== ws.CLOSING)
        socket.send(JSON.stringify(message));
    };
    socket.on('message', (message: string) => {
      connection.dispatch(JSON.parse(Buffer.from(message).toString()));
    });
    socket.on('error', () => {});
    const selectors = new Selectors();
    const scope = connection.rootDispatcher();
    const browser = new ConnectedBrowser(scope, this._browser, selectors);
    new RemoteBrowserDispatcher(scope, browser, selectors);
    socket.on('close', () => {
      // Avoid sending any more messages over closed socket.
      connection.onmessage = () => {};
      // Cleanup contexts upon disconnect.
      browser.close().catch(e => {});
    });
  }
}

class RemoteBrowserDispatcher extends Dispatcher<{}, channels.RemoteBrowserInitializer> implements channels.PlaywrightChannel {
  constructor(scope: DispatcherScope, browser: ConnectedBrowser, selectors: Selectors) {
    super(scope, {}, 'RemoteBrowser', {
      selectors: new SelectorsDispatcher(scope, selectors),
      browser,
    }, false, 'remoteBrowser');
  }
}

class ConnectedBrowser extends BrowserDispatcher {
  private _contexts: BrowserContextDispatcher[] = [];
  private _selectors: Selectors;
  _closed = false;

  constructor(scope: DispatcherScope, browser: Browser, selectors: Selectors) {
    super(scope, browser);
    this._selectors = selectors;
  }

  async newContext(params: channels.BrowserNewContextParams): Promise<{ context: channels.BrowserContextChannel }> {
    const result = await super.newContext(params);
    const dispatcher = result.context as BrowserContextDispatcher;
    dispatcher._object._setSelectors(this._selectors);
    this._contexts.push(dispatcher);
    return result;
  }

  async close(): Promise<void> {
    // Only close our own contexts.
    await Promise.all(this._contexts.map(context => context.close()));
    this._didClose();
  }

  _didClose() {
    if (!this._closed) {
      // We come here multiple times:
      // - from ConnectedBrowser.close();
      // - from underlying Browser.on('close').
      this._closed = true;
      super._didClose();
    }
  }
}
