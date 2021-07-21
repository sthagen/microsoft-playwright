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

import childProcess from 'child_process';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs';
import net from 'net';

import { contextTest, expect } from './config/browserTest';
import { PlaywrightClient } from '../lib/remote/playwrightClient';
import { createGuid } from '../src/utils/utils';
import type { PlaywrightServerOptions } from '../src/remote/playwrightServer';
import type { LaunchOptions, ConnectOptions } from '../index';
import type { Page, BrowserServer } from '..';

class OutOfProcessPlaywrightServer {
  private _driverProcess: childProcess.ChildProcess;
  private _receivedPortPromise: Promise<string>;
  constructor(port: number, config: PlaywrightServerOptions) {
    const configFile = path.join(os.tmpdir(), `playwright-server-config-${createGuid()}.json`);
    fs.writeFileSync(configFile, JSON.stringify(config));
    this._driverProcess = childProcess.fork(path.join(__dirname, '..', 'lib', 'cli', 'cli.js'), ['run-server', port.toString(), configFile], {
      stdio: 'pipe',
      detached: true,
    });
    this._driverProcess.unref();
    this._receivedPortPromise = new Promise<string>((resolve, reject) => {
      this._driverProcess.stdout.on('data', (data: Buffer) => {
        const prefix = 'Listening on ';
        const line = data.toString();
        if (line.startsWith(prefix))
          resolve(line.substr(prefix.length));
      });
      this._driverProcess.on('exit', () => reject());
    });
  }
  async kill() {
    const waitForExit = new Promise<void>(resolve =>  this._driverProcess.on('exit', () => resolve()));
    this._driverProcess.kill('SIGKILL');
    await waitForExit;
  }
  public async wsEndpoint(): Promise<string> {
    return await this._receivedPortPromise;
  }
}

type PageFactoryOptions = {
  acceptForwardedPorts: boolean
  forwardPorts: number[]
};

type LaunchMode = 'playwrightclient' | 'launchServer';

const it = contextTest.extend<{ pageFactory: (options?: PageFactoryOptions) => Promise<Page>, launchMode: LaunchMode }>({
  launchMode: [ 'launchServer', { scope: 'test' }],
  pageFactory: async ({ launchMode, browserType, browserName, browserOptions }, run) => {
    const browserServers: BrowserServer[] = [];
    const playwrightServers: OutOfProcessPlaywrightServer[] = [];
    await run(async (options?: PageFactoryOptions): Promise<Page> => {
      const { acceptForwardedPorts, forwardPorts } = options;
      if (launchMode === 'playwrightclient') {
        const server = new OutOfProcessPlaywrightServer(0, {
          acceptForwardedPorts,
        });
        playwrightServers.push(server);
        const service = await PlaywrightClient.connect({
          wsEndpoint: await server.wsEndpoint(),
          forwardPorts,
        });
        const playwright = service.playwright();
        const browser = await playwright[browserName].launch(browserOptions);
        return await browser.newPage();
      }
      const browserServer = await browserType.launchServer({
        ...browserOptions,
        _acceptForwardedPorts: acceptForwardedPorts
      } as LaunchOptions);
      browserServers.push(browserServer);
      const browser = await browserType.connect({
        wsEndpoint: browserServer.wsEndpoint(),
        _forwardPorts: forwardPorts
      } as ConnectOptions);
      return await browser.newPage();
    });
    for (const browserServer of browserServers)
      await browserServer.close();
    for (const playwrightServer of playwrightServers)
      await playwrightServer.kill();
  },
});

it.fixme(({ platform, browserName }) => platform === 'darwin' && browserName === 'webkit');
it.skip(({ mode }) => mode !== 'default');

it.beforeEach(() => {
  delete process.env.PW_TEST_PROXY_TARGET;
});

async function startTestServer() {
  const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
    res.end('<html><body>from-retargeted-server</body></html>');
  });
  await new Promise(resolve => server.listen(0, resolve));
  return {
    testServerPort: (server.address() as net.AddressInfo).port,
    stopTestServer: () => server.close()
  };
}

for (const launchMode of ['playwrightclient', 'launchServer'] as LaunchMode[]) {
  it.describe(`${launchMode}:`, () => {
    it.use({ launchMode });

    it('should forward non-forwarded requests', async ({ pageFactory, server }) => {
      let reachedOriginalTarget = false;
      server.setRoute('/foo.html', async (req, res) => {
        reachedOriginalTarget = true;
        res.end('<html><body>original-target</body></html>');
      });
      const page = await pageFactory({ acceptForwardedPorts: true, forwardPorts: [] });
      await page.goto(server.PREFIX + '/foo.html');
      expect(await page.content()).toContain('original-target');
      expect(reachedOriginalTarget).toBe(true);
    });

    it('should proxy local requests', async ({ pageFactory, server }, workerInfo) => {
      const { testServerPort, stopTestServer } = await startTestServer();
      process.env.PW_TEST_PROXY_TARGET = testServerPort.toString();
      let reachedOriginalTarget = false;
      server.setRoute('/foo.html', async (req, res) => {
        reachedOriginalTarget = true;
        res.end('<html><body></body></html>');
      });
      const examplePort = 20_000 + workerInfo.workerIndex * 3;
      const page = await pageFactory({ acceptForwardedPorts: true, forwardPorts: [examplePort] });
      await page.goto(`http://localhost:${examplePort}/foo.html`);
      expect(await page.content()).toContain('from-retargeted-server');
      expect(reachedOriginalTarget).toBe(false);
      stopTestServer();
    });

    it('should lead to the error page for forwarded requests when the connection is refused', async ({ pageFactory }, workerInfo) => {
      const examplePort = 20_000 + workerInfo.workerIndex * 3;
      const page = await pageFactory({ acceptForwardedPorts: true, forwardPorts: [examplePort] });
      const response = await page.goto(`http://localhost:${examplePort}`);
      expect(response.status()).toBe(502);
      await page.waitForSelector('text=Connection error');
    });

    it('should lead to the error page for non-forwarded requests when the connection is refused', async ({ pageFactory }) => {
      process.env.PW_TEST_PROXY_TARGET = '50001';
      const page = await pageFactory({ acceptForwardedPorts: true, forwardPorts: [] });
      const response = await page.goto(`http://localhost:44123/non-existing-url`);
      expect(response.status()).toBe(502);
      await page.waitForSelector('text=Connection error');
    });

    it('should should not allow to connect when the server does not allow port-forwarding', async ({ pageFactory }) => {
      await expect(pageFactory({ acceptForwardedPorts: false, forwardPorts: [] })).rejects.toThrowError('Port forwarding needs to be enabled when launching the server via BrowserType.launchServer.');
      await expect(pageFactory({ acceptForwardedPorts: false, forwardPorts: [1234] })).rejects.toThrowError('Port forwarding needs to be enabled when launching the server via BrowserType.launchServer.');
    });
  });
}

it('launchServer: should not allow connecting a second client when _acceptForwardedPorts is used', async ({ browserType, browserOptions }, workerInfo) => {
  const browserServer = await browserType.launchServer({
    ...browserOptions,
    _acceptForwardedPorts: true
  } as LaunchOptions);
  const examplePort = 20_000 + workerInfo.workerIndex * 3;

  const browser1 = await browserType.connect({
    wsEndpoint: browserServer.wsEndpoint(),
    _forwardPorts: [examplePort]
  } as ConnectOptions);
  await expect(browserType.connect({
    wsEndpoint: browserServer.wsEndpoint(),
    _forwardPorts: [examplePort]
  } as ConnectOptions)).rejects.toThrowError('browserType.connect: WebSocket server disconnected (1005)');
  await browser1.close();
  const browser2 = await browserType.connect({
    wsEndpoint: browserServer.wsEndpoint(),
    _forwardPorts: [examplePort]
  } as ConnectOptions);
  await browser2.close();

  await browserServer.close();
});
