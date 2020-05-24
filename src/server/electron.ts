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

import * as path from 'path';
import { CRBrowser, CRBrowserContext } from '../chromium/crBrowser';
import { CRConnection, CRSession } from '../chromium/crConnection';
import { CRExecutionContext } from '../chromium/crExecutionContext';
import { TimeoutError } from '../errors';
import { Events } from '../events';
import { ExtendedEventEmitter } from '../extendedEventEmitter';
import { helper } from '../helper';
import * as js from '../javascript';
import { InnerLogger, Logger, RootLogger } from '../logger';
import { Page } from '../page';
import { TimeoutSettings } from '../timeoutSettings';
import { WebSocketTransport } from '../transport';
import * as types from '../types';
import { BrowserServer } from './browserServer';
import { launchProcess, waitForLine } from './processLauncher';
import { BrowserContext } from '../browserContext';
import type {BrowserWindow} from 'electron';

type ElectronLaunchOptions = {
  args?: string[],
  cwd?: string,
  env?: {[key: string]: string|number|boolean},
  handleSIGINT?: boolean,
  handleSIGTERM?: boolean,
  handleSIGHUP?: boolean,
  timeout?: number,
  logger?: Logger,
};

export const ElectronEvents = {
  ElectronApplication: {
    Close: 'close',
    Window: 'window',
  }
};

interface ElectronPage extends Page {
  browserWindow: js.JSHandle<BrowserWindow>;
  _browserWindowId: number;
}

export class ElectronApplication extends ExtendedEventEmitter {
  private _logger: InnerLogger;
  private _browserContext: CRBrowserContext;
  private _nodeConnection: CRConnection;
  private _nodeSession: CRSession;
  private _nodeExecutionContext: js.ExecutionContext | undefined;
  private _nodeElectronHandle: js.JSHandle<any> | undefined;
  private _windows = new Set<ElectronPage>();
  private _lastWindowId = 0;
  readonly _timeoutSettings = new TimeoutSettings();

  constructor(logger: InnerLogger, browser: CRBrowser, nodeConnection: CRConnection) {
    super();
    this._logger = logger;
    this._browserContext = browser._defaultContext as CRBrowserContext;
    this._browserContext.on(Events.BrowserContext.Close, () => this.emit(ElectronEvents.ElectronApplication.Close));
    this._browserContext.on(Events.BrowserContext.Page, event => this._onPage(event));
    this._nodeConnection = nodeConnection;
    this._nodeSession = nodeConnection.rootSession;
  }

  private async _onPage(page: ElectronPage) {
    // Needs to be sync.
    const windowId = ++this._lastWindowId;
    // Can be async.
    const handle = await this._nodeElectronHandle!.evaluateHandle(({ BrowserWindow }, windowId) => BrowserWindow.fromId(windowId), windowId).catch(e => {});
    if (!handle)
      return;
    page.browserWindow = handle;
    page._browserWindowId = windowId;
    page.on(Events.Page.Close, () => {
      page.browserWindow.dispose();
      this._windows.delete(page);
    });
    this._windows.add(page);
    await page.waitForLoadState('domcontentloaded').catch(e => {}); // can happen after detach
    this.emit(ElectronEvents.ElectronApplication.Window, page);
  }

  windows(): Page[] {
    return [...this._windows];
  }

  async firstWindow(): Promise<Page> {
    if (this._windows.size)
      return this._windows.values().next().value;
    return this.waitForEvent('window');
  }

  async newBrowserWindow(options: any): Promise<Page> {
    const windowId = await this.evaluate(async ({ BrowserWindow }, options) => {
      const win = new BrowserWindow(options);
      win.loadURL('about:blank');
      return win.id;
    }, options);

    for (const page of this._windows) {
      if (page._browserWindowId === windowId)
        return page;
    }

    return await this.waitForEvent(ElectronEvents.ElectronApplication.Window, (page: ElectronPage) => page._browserWindowId === windowId);
  }

  context(): BrowserContext {
    return this._browserContext;
  }

  async close() {
    await this.evaluate(({ app }) => app.quit());
    this._nodeConnection.close();
  }

  async _init()  {
    this._nodeSession.once('Runtime.executionContextCreated', event => {
      this._nodeExecutionContext = new js.ExecutionContext(new CRExecutionContext(this._nodeSession, event.context), this._logger);
    });
    await this._nodeSession.send('Runtime.enable', {}).catch(e => {});
    this._nodeElectronHandle = await this._nodeExecutionContext!.evaluateHandleInternal(() => {
      // Resolving the race between the debugger and the boot-time script.
      if ((global as any)._playwrightRun)
        return (global as any)._playwrightRun();
      return new Promise(f => (global as any)._playwrightRunCallback = f);
    });
  }

  async evaluate<R, Arg>(pageFunction: types.FuncOn<any, Arg, R>, arg: Arg): Promise<R>;
  async evaluate<R>(pageFunction: types.FuncOn<any, void, R>, arg?: any): Promise<R>;
  async evaluate<R, Arg>(pageFunction: types.FuncOn<any, Arg, R>, arg: Arg): Promise<R> {
    return this._nodeElectronHandle!.evaluate(pageFunction, arg);
  }

  async evaluateHandle<R, Arg>(pageFunction: types.FuncOn<any, Arg, R>, arg: Arg): Promise<types.SmartHandle<R>>;
  async evaluateHandle<R>(pageFunction: types.FuncOn<any, void, R>, arg?: any): Promise<types.SmartHandle<R>>;
  async evaluateHandle<R, Arg>(pageFunction: types.FuncOn<any, Arg, R>, arg: Arg): Promise<types.SmartHandle<R>> {
    return this._nodeElectronHandle!.evaluateHandle(pageFunction, arg);
  }

  protected _computeDeadline(options?: types.TimeoutOptions): number {
    return this._timeoutSettings.computeDeadline(options);
  }
}

export class Electron  {
  async launch(executablePath: string, options: ElectronLaunchOptions = {}): Promise<ElectronApplication> {
    const {
      args = [],
      env = process.env,
      handleSIGINT = true,
      handleSIGTERM = true,
      handleSIGHUP = true,
    } = options;
    const deadline = TimeoutSettings.computeDeadline(options.timeout, 30000);
    let app: ElectronApplication | undefined = undefined;

    const logger = new RootLogger(options.logger);
    const electronArguments = ['--inspect=0', '--remote-debugging-port=0', '--require', path.join(__dirname, 'electronLoader.js'), ...args];
    const { launchedProcess, gracefullyClose } = await launchProcess({
      executablePath,
      args: electronArguments,
      env,
      handleSIGINT,
      handleSIGTERM,
      handleSIGHUP,
      logger,
      pipe: true,
      cwd: options.cwd,
      tempDirectories: [],
      attemptToGracefullyClose: () => app!.close(),
      onkill: (exitCode, signal) => {
        if (app)
          app.emit(ElectronEvents.ElectronApplication.Close, exitCode, signal);
      },
    });

    const timeoutError = new TimeoutError(`Timed out while trying to connect to Electron!`);
    const nodeMatch = await waitForLine(launchedProcess, launchedProcess.stderr, /^Debugger listening on (ws:\/\/.*)$/, helper.timeUntilDeadline(deadline), timeoutError);
    const nodeTransport = await WebSocketTransport.connect(nodeMatch[1], logger, deadline);
    const nodeConnection = new CRConnection(nodeTransport, logger);

    const chromeMatch = await waitForLine(launchedProcess, launchedProcess.stderr, /^DevTools listening on (ws:\/\/.*)$/, helper.timeUntilDeadline(deadline), timeoutError);
    const chromeTransport = await WebSocketTransport.connect(chromeMatch[1], logger, deadline);
    const browserServer = new BrowserServer(launchedProcess, gracefullyClose);
    const browser = await CRBrowser.connect(chromeTransport, { headful: true, logger, persistent: { viewport: null }, ownedServer: browserServer });
    app = new ElectronApplication(logger, browser, nodeConnection);
    await app._init();
    return app;
  }
}
