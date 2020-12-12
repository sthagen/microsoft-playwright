/**
 * Copyright Microsoft Corporation. All rights reserved.
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

import * as debug from 'debug';
import * as types from '../types';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as stream from 'stream';
import * as util from 'util';
import * as ws from 'ws';
import { createGuid, makeWaitForNextTask } from '../../utils/utils';
import { BrowserOptions, BrowserProcess } from '../browser';
import { BrowserContext, validateBrowserContextOptions } from '../browserContext';
import { ProgressController } from '../progress';
import { CRBrowser } from '../chromium/crBrowser';
import { helper } from '../helper';
import { Transport } from '../../protocol/transport';
import { RecentLogsCollector } from '../../utils/debugLogger';
import { TimeoutSettings } from '../../utils/timeoutSettings';
import { AndroidWebView } from '../../protocol/channels';

const readFileAsync = util.promisify(fs.readFile);

export interface Backend {
  devices(): Promise<DeviceBackend[]>;
}

export interface DeviceBackend {
  serial: string;
  status: string;
  close(): Promise<void>;
  init(): Promise<void>;
  runCommand(command: string): Promise<string>;
  open(command: string): Promise<SocketBackend>;
}

export interface SocketBackend extends EventEmitter {
  write(data: Buffer): Promise<void>;
  close(): Promise<void>;
}

export class Android {
  private _backend: Backend;
  private _devices = new Map<string, AndroidDevice>();
  readonly _timeoutSettings: TimeoutSettings;

  constructor(backend: Backend) {
    this._backend = backend;
    this._timeoutSettings = new TimeoutSettings();
  }

  setDefaultTimeout(timeout: number) {
    this._timeoutSettings.setDefaultTimeout(timeout);
  }

  async devices(): Promise<AndroidDevice[]> {
    const devices = (await this._backend.devices()).filter(d => d.status === 'device');
    const newSerials = new Set<string>();
    for (const d of devices) {
      newSerials.add(d.serial);
      if (this._devices.has(d.serial))
        continue;
      const device = await AndroidDevice.create(this, d);
      this._devices.set(d.serial, device);
    }
    for (const d of this._devices.keys()) {
      if (!newSerials.has(d))
        this._devices.delete(d);
    }
    return [...this._devices.values()];
  }

  _deviceClosed(device: AndroidDevice) {
    this._devices.delete(device.serial);
  }
}

export class AndroidDevice extends EventEmitter {
  readonly _backend: DeviceBackend;
  readonly model: string;
  readonly serial: string;
  private _driverPromise: Promise<Transport> | undefined;
  private _lastId = 0;
  private _callbacks = new Map<number, { fulfill: (result: any) => void, reject: (error: Error) => void }>();
  private _pollingWebViews: NodeJS.Timeout | undefined;
  readonly _timeoutSettings: TimeoutSettings;
  private _webViews = new Map<number, AndroidWebView>();

  static Events = {
    WebViewAdded: 'webViewAdded',
    WebViewRemoved: 'webViewRemoved',
    Closed: 'closed'
  };

  private _browserConnections = new Set<AndroidBrowser>();
  private _android: Android;
  private _isClosed = false;

  constructor(android: Android, backend: DeviceBackend, model: string) {
    super();
    this._android = android;
    this._backend = backend;
    this.model = model;
    this.serial = backend.serial;
    this._timeoutSettings = new TimeoutSettings(android._timeoutSettings);
  }

  static async create(android: Android, backend: DeviceBackend): Promise<AndroidDevice> {
    await backend.init();
    const model = await backend.runCommand('shell:getprop ro.product.model');
    const device = new AndroidDevice(android, backend, model.trim());
    await device._init();
    return device;
  }

  async _init() {
    await this._refreshWebViews();
    const poll = () => {
      this._pollingWebViews = setTimeout(() => this._refreshWebViews().then(poll).catch(() => {}), 500);
    };
    poll();
  }

  setDefaultTimeout(timeout: number) {
    this._timeoutSettings.setDefaultTimeout(timeout);
  }

  async shell(command: string): Promise<string> {
    const result = await this._backend.runCommand(`shell:${command}`);
    await this._refreshWebViews();
    return result;
  }

  private async _driver(): Promise<Transport> {
    if (this._driverPromise)
      return this._driverPromise;
    let callback: any;
    this._driverPromise = new Promise(f => callback = f);

    debug('pw:android')('Stopping the old driver');
    await this.shell(`am force-stop com.microsoft.playwright.androiddriver`);

    debug('pw:android')('Uninstalling the old driver');
    await this.shell(`cmd package uninstall com.microsoft.playwright.androiddriver`);
    await this.shell(`cmd package uninstall com.microsoft.playwright.androiddriver.test`);

    debug('pw:android')('Installing the new driver');
    for (const file of ['android-driver.apk', 'android-driver-target.apk']) {
      debug('pw:android')('Reading ' + require.resolve(`../../../bin/${file}`));
      const driverFile = await readFileAsync(require.resolve(`../../../bin/${file}`));
      debug('pw:android')('Opening install socket');
      const installSocket = await this._backend.open(`shell:cmd package install -r -t -S ${driverFile.length}`);
      debug('pw:android')('Writing driver bytes: ' + driverFile.length);
      await installSocket.write(driverFile);
      const success = await new Promise(f => installSocket.on('data', f));
      debug('pw:android')('Written driver bytes: ' + success);
    }

    debug('pw:android')('Starting the new driver');
    this.shell(`am instrument -w com.microsoft.playwright.androiddriver.test/androidx.test.runner.AndroidJUnitRunner`);

    debug('pw:android')('Polling the socket');
    let socket;
    while (!socket) {
      try {
        socket = await this._backend.open(`localabstract:playwright_android_driver_socket`);
      } catch (e)  {
        await new Promise(f => setTimeout(f, 100));
      }
    }

    debug('pw:android')('Connected to driver');
    const transport = new Transport(socket, socket, socket, 'be');
    transport.onmessage = message => {
      const response = JSON.parse(message);
      const { id, result, error } = response;
      const callback = this._callbacks.get(id);
      if (!callback)
        return;
      if (error)
        callback.reject(new Error(error));
      else
        callback.fulfill(result);
      this._callbacks.delete(id);
    };

    callback(transport);
    return this._driverPromise;
  }

  async send(method: string, params: any): Promise<any> {
    const driver = await this._driver();
    const id = ++this._lastId;
    const result = new Promise((fulfill, reject) => this._callbacks.set(id, { fulfill, reject }));
    driver.send(JSON.stringify({ id, method, params }));
    return result;
  }

  async close() {
    this._isClosed = true;
    if (this._pollingWebViews)
      clearTimeout(this._pollingWebViews);
    for (const connection of this._browserConnections)
      await connection.close();
    if (this._driverPromise) {
      const driver = await this._driver();
      driver.close();
    }
    await this._backend.close();
    this._android._deviceClosed(this);
    this.emit(AndroidDevice.Events.Closed);
  }

  async launchBrowser(pkg: string = 'com.android.chrome', options: types.BrowserContextOptions = {}): Promise<BrowserContext> {
    debug('pw:android')('Force-stopping', pkg);
    await this._backend.runCommand(`shell:am force-stop ${pkg}`);

    const socketName = createGuid();
    const commandLine = `_ --disable-fre --no-default-browser-check --no-first-run --remote-debugging-socket-name=${socketName}`;
    debug('pw:android')('Starting', pkg, commandLine);
    await this._backend.runCommand(`shell:echo "${commandLine}" > /data/local/tmp/chrome-command-line`);
    await this._backend.runCommand(`shell:am start -n ${pkg}/com.google.android.apps.chrome.Main about:blank`);

    debug('pw:android')('Polling for socket', socketName);
    while (true) {
      const net = await this._backend.runCommand(`shell:cat /proc/net/unix | grep ${socketName}$`);
      if (net)
        break;
      await new Promise(f => setTimeout(f, 100));
    }
    debug('pw:android')('Got the socket, connecting');
    return await this._connectToBrowser(socketName, options);
  }

  async connectToWebView(pid: number): Promise<BrowserContext> {
    const webView = this._webViews.get(pid);
    if (!webView)
      throw new Error('WebView has been closed');
    return await this._connectToBrowser(`webview_devtools_remote_${pid}`);
  }

  private async _connectToBrowser(socketName: string, options: types.BrowserContextOptions = {}): Promise<BrowserContext> {
    const androidBrowser = new AndroidBrowser(this, socketName);
    await androidBrowser._open();
    this._browserConnections.add(androidBrowser);

    const browserOptions: BrowserOptions = {
      name: 'clank',
      slowMo: 0,
      persistent: { ...options, noDefaultViewport: true },
      downloadsPath: undefined,
      browserProcess: new ClankBrowserProcess(androidBrowser),
      proxy: options.proxy,
      protocolLogger: helper.debugProtocolLogger(),
      browserLogsCollector: new RecentLogsCollector()
    };
    validateBrowserContextOptions(options, browserOptions);

    const browser = await CRBrowser.connect(androidBrowser, browserOptions);
    const controller = new ProgressController();
    await controller.run(async progress => {
      await browser._defaultContext!._loadDefaultContextAsIs(progress);
    });
    return browser._defaultContext!;
  }

  webViews(): AndroidWebView[] {
    return [...this._webViews.values()];
  }

  private async _refreshWebViews() {
    const sockets = (await this._backend.runCommand(`shell:cat /proc/net/unix | grep webview_devtools_remote`)).split('\n');
    if (this._isClosed)
      return;

    const newPids = new Set<number>();
    for (const line of sockets) {
      const match = line.match(/[^@]+@webview_devtools_remote_(\d+)/);
      if (!match)
        continue;
      const pid = +match[1];
      newPids.add(pid);
    }
    for (const pid of newPids) {
      if (this._webViews.has(pid))
        continue;

      const procs = (await this._backend.runCommand(`shell:ps -A | grep ${pid}`)).split('\n');
      if (this._isClosed)
        return;
      let pkg = '';
      for (const proc of procs) {
        const match = proc.match(/[^\s]+\s+(\d+).*$/);
        if (!match)
          continue;
        const p = match[1];
        if (+p !== pid)
          continue;
        pkg = proc.substring(proc.lastIndexOf(' ') + 1);
      }
      const webView = { pid, pkg };
      this._webViews.set(pid, webView);
      this.emit(AndroidDevice.Events.WebViewAdded, webView);
    }

    for (const p of this._webViews.keys()) {
      if (!newPids.has(p)) {
        this._webViews.delete(p);
        this.emit(AndroidDevice.Events.WebViewRemoved, p);
      }
    }
  }
}

class AndroidBrowser extends EventEmitter {
  readonly device: AndroidDevice;
  readonly socketName: string;
  private _socket: SocketBackend | undefined;
  private _receiver: stream.Writable;
  private _waitForNextTask = makeWaitForNextTask();
  onmessage?: (message: any) => void;
  onclose?: () => void;

  constructor(device: AndroidDevice, socketName: string) {
    super();
    this.device = device;
    this.socketName = socketName;
    this._receiver = new (ws as any).Receiver() as stream.Writable;
    this._receiver.on('message', message => {
      this._waitForNextTask(() => {
        if (this.onmessage)
          this.onmessage(JSON.parse(message));
      });
    });
  }

  async _open() {
    this._socket = await this.device._backend.open(`localabstract:${this.socketName}`);
    this._socket.on('close', () => {
      this._waitForNextTask(() => {
        if (this.onclose)
          this.onclose();
      });
    });
    await this._socket.write(Buffer.from(`GET /devtools/browser HTTP/1.1\r
Upgrade: WebSocket\r
Connection: Upgrade\r
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r
Sec-WebSocket-Version: 13\r
\r
`));
    // HTTP Upgrade response.
    await new Promise(f => this._socket!.once('data', f));

    // Start sending web frame to receiver.
    this._socket.on('data', data => this._receiver._write(data, 'binary', () => {}));
  }

  async send(s: any) {
    await this._socket!.write(encodeWebFrame(JSON.stringify(s)));
  }

  async close() {
    await this._socket!.close();
  }
}

function encodeWebFrame(data: string): Buffer {
  return (ws as any).Sender.frame(Buffer.from(data), {
    opcode: 1,
    mask: true,
    fin: true,
    readOnly: true
  })[0];
}

class ClankBrowserProcess implements BrowserProcess {
  private _browser: AndroidBrowser;

  constructor(browser: AndroidBrowser) {
    this._browser = browser;
  }

  onclose: ((exitCode: number | null, signal: string | null) => void) | undefined;

  async kill(): Promise<void> {
  }

  async close(): Promise<void> {
    await this._browser.close();
  }
}
