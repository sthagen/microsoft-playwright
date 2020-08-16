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

import fs from 'fs';
import path from 'path';
import os from 'os';
import childProcess from 'child_process';
import { LaunchOptions, BrowserType, Browser, BrowserContext, Page, BrowserServer } from '../index';
import { TestServer } from '../utils/testserver/';
import { Connection } from '../lib/rpc/client/connection';
import { Transport } from '../lib/rpc/transport';
import { setUnderTest } from '../lib/helper';
import { installCoverageHooks } from './runner/coverage';
import { valueFromEnv } from './runner/utils';
import { registerFixture, registerWorkerFixture} from './runner/fixtures';

import {mkdtempAsync, removeFolderAsync} from './utils';

setUnderTest(); // Note: we must call setUnderTest before requiring Playwright

const browserName = process.env.BROWSER || 'chromium';
const platform = os.platform();

declare global {
  interface WorkerState {
    asset: (path: string) => string;
    parallelIndex: number;
    defaultBrowserOptions: LaunchOptions;
    golden: (path: string) => string;
    playwright: typeof import('../index');
    browserType: BrowserType<Browser>;
    browser: Browser;
    tmpDir: string;
  }
  interface FixtureState {
    toImpl: (rpcObject: any) => any;
    context: BrowserContext;
    server: TestServer;
    page: Page;
    httpsServer: TestServer;
    browserServer: BrowserServer;
  }
}

(global as any).MAC = platform === 'darwin';
(global as any).LINUX = platform === 'linux';
(global as any).WIN = platform === 'win32';
(global as any).CHROMIUM = browserName === 'chromium';
(global as any).FFOX = browserName === 'firefox';
(global as any).WEBKIT = browserName === 'webkit';

registerWorkerFixture('parallelIndex', async ({}, test) => {
  await test(parseInt(process.env.JEST_WORKER_ID, 10) - 1);
});

registerWorkerFixture('httpService', async ({parallelIndex}, test) => {
  const assetsPath = path.join(__dirname, 'assets');
  const cachedPath = path.join(__dirname, 'assets', 'cached');

  const port = 8907 + parallelIndex * 2;
  const server = await TestServer.create(assetsPath, port);
  server.enableHTTPCache(cachedPath);

  const httpsPort = port + 1;
  const httpsServer = await TestServer.createHTTPS(assetsPath, httpsPort);
  httpsServer.enableHTTPCache(cachedPath);

  await test({server, httpsServer});

  await Promise.all([
    server.stop(),
    httpsServer.stop(),
  ]);
});

const getExecutablePath = () => {
  if (browserName === 'chromium' && process.env.CRPATH)
    return process.env.CRPATH;
  if (browserName === 'firefox' && process.env.FFPATH)
    return process.env.FFPATH;
  if (browserName === 'webkit' && process.env.WKPATH)
    return process.env.WKPATH;
  return
}

registerWorkerFixture('defaultBrowserOptions', async({}, test) => {
  let executablePath = getExecutablePath();

  if (executablePath)
    console.error(`Using executable at ${executablePath}`);
  await test({
    handleSIGINT: false,
    slowMo: valueFromEnv('SLOW_MO', 0),
    headless: !!valueFromEnv('HEADLESS', true),
    executablePath
  });
});

registerWorkerFixture('playwright', async({parallelIndex}, test) => {
  const {coverage, uninstall} = installCoverageHooks(browserName);
  if (process.env.PWWIRE) {
    const connection = new Connection();
    const spawnedProcess = childProcess.fork(path.join(__dirname, '..', 'lib', 'rpc', 'server'), [], {
      stdio: 'pipe',
      detached: true,
    });
    spawnedProcess.unref();
    const onExit = (exitCode, signal) => {
      throw new Error(`Server closed with exitCode=${exitCode} signal=${signal}`);
    };
    spawnedProcess.on('exit', onExit);
    const transport = new Transport(spawnedProcess.stdin, spawnedProcess.stdout);
    connection.onmessage = message => transport.send(JSON.stringify(message));
    transport.onmessage = message => connection.dispatch(JSON.parse(message));
    const playwrightObject = await connection.waitForObjectWithKnownName('Playwright');
    await test(playwrightObject);
    spawnedProcess.removeListener('exit', onExit);
    spawnedProcess.stdin.destroy();
    spawnedProcess.stdout.destroy();
    spawnedProcess.stderr.destroy();
    await teardownCoverage();
  } else {
    await test(require('../index'))
    await teardownCoverage();
  }

  async function teardownCoverage() {
    uninstall();
    const coveragePath = path.join(path.join(__dirname, 'output-' + browserName), 'coverage', parallelIndex + '.json');
    const coverageJSON = [...coverage.keys()].filter(key => coverage.get(key));
    await fs.promises.mkdir(path.dirname(coveragePath), { recursive: true });
    await fs.promises.writeFile(coveragePath, JSON.stringify(coverageJSON, undefined, 2), 'utf8');
  }

});

registerFixture('toImpl', async ({playwright}, test) => {
  await test((playwright as any)._toImpl);
});

registerWorkerFixture('browserType', async ({playwright}, test) => {
  const browserType = playwright[process.env.BROWSER || 'chromium']
  const executablePath = getExecutablePath()
  if (executablePath)
    browserType._executablePath = executablePath
  await test(browserType);
});

registerWorkerFixture('browser', async ({browserType, defaultBrowserOptions}, test) => {
  const browser = await browserType.launch(defaultBrowserOptions);
  await test(browser);
  if (browser.contexts().length !== 0) {
    console.warn(`\nWARNING: test did not close all created contexts! ${new Error().stack}\n`);
    await Promise.all(browser.contexts().map(context => context.close())).catch(e => void 0);
  }
  await browser.close();
});

registerFixture('context', async ({browser}, test) => {
  const context = await browser.newContext();
  await test(context);
  await context.close();
});

registerFixture('page', async ({context}, test) => {
  const page = await context.newPage();
  await test(page);
});

registerFixture('server', async ({httpService}, test) => {
  httpService.server.reset();
  await test(httpService.server);
});

registerFixture('browserName', async ({}, test) => {
  await test(browserName);
});

registerFixture('httpsServer', async ({httpService}, test) => {
  httpService.httpsServer.reset();
  await test(httpService.httpsServer);
});

registerFixture('tmpDir', async ({}, test) => {
  const tmpDir = await mkdtempAsync(path.join(os.tmpdir(), 'playwright-test-'));
  await test(tmpDir);
  await removeFolderAsync(tmpDir).catch(e => {});
});

registerWorkerFixture('asset', async ({}, test) => {
  await test(p => path.join(__dirname, `assets`, p));
});

registerWorkerFixture('golden', async ({browserName}, test) => {
  await test(p => path.join(__dirname, `golden-${browserName}`, p));
});
