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
import http from 'http';
import https from 'https';
import path from 'path';
import net from 'net';
import { spawn, spawnSync } from 'child_process';
import type { ChildProcess } from 'child_process';

import { debug } from 'playwright-core/lib/utilsBundle';
import { raceAgainstTimeout } from 'playwright-core/lib/utils/timeoutRunner';

import type { FullConfig, Reporter, Suite } from '../../types/testReporter';
import type { TestRunnerPlugin } from '.';
import type { FullConfigInternal } from '../types';
import { envWithoutExperimentalLoaderOptions } from '../cli';


export type WebServerPluginOptions = {
  command: string;
  url: string;
  ignoreHTTPSErrors?: boolean;
  timeout?: number;
  reuseExistingServer?: boolean;
  cwd?: string;
  env?: { [key: string]: string; };
};

const DEFAULT_ENVIRONMENT_VARIABLES = {
  'BROWSER': 'none', // Disable that create-react-app will open the page in the browser
};

const debugWebServer = debug('pw:webserver');

export class WebServerPlugin implements TestRunnerPlugin {
  private _isAvailable?: () => Promise<boolean>;
  private _processExitedPromise?: Promise<{ code: number|null, signal: NodeJS.Signals|null }>;
  private _childProcess?: ChildProcess;
  private _options: WebServerPluginOptions;
  private _checkPortOnly: boolean;
  private _reporter?: Reporter;
  name = 'playwright:webserver';

  constructor(options: WebServerPluginOptions, checkPortOnly: boolean) {
    this._options = options;
    this._checkPortOnly = checkPortOnly;
  }

  public async setup(config: FullConfig, configDir: string, rootSuite: Suite, reporter: Reporter) {
    this._reporter = reporter;
    this._isAvailable = getIsAvailableFunction(this._options.url, this._checkPortOnly, !!this._options.ignoreHTTPSErrors, this._reporter.onStdErr?.bind(this._reporter));
    this._options.cwd = this._options.cwd ? path.resolve(configDir, this._options.cwd) : configDir;
    try {
      await this._startProcess();
    } catch (error) {
      await this.teardown();
      throw error;
    }
  }

  public async teardown() {
    if (!this._childProcess || !this._childProcess.pid || this._childProcess.killed)
      return;
    // Send SIGTERM and wait for it to gracefully close.
    try {
      if (process.platform === 'win32') {
        const taskkillProcess = spawnSync(`taskkill /pid ${this._childProcess.pid} /T /F`, { shell: true });
        const [stdout, stderr] = [taskkillProcess.stdout.toString(), taskkillProcess.stderr.toString()];
        if (stdout)
          debugWebServer(`[pid=${this._childProcess.pid}] taskkill stdout: ${stdout}`);
        if (stderr)
          debugWebServer(`[pid=${this._childProcess.pid}] taskkill stderr: ${stderr}`);
      } else {
        process.kill(this._childProcess.pid, 'SIGTERM');
      }
    } catch (e) {
      // the process might have already stopped
    }
    await this._processExitedPromise;
  }

  private async _startProcess(): Promise<void> {
    const isAlreadyAvailable = await this._isAvailable!();
    if (isAlreadyAvailable) {
      debugWebServer(`WebServer is already available`);
      if (this._options.reuseExistingServer)
        return;
      const port = new URL(this._options.url);
      throw new Error(`${this._options.url ?? `http://localhost${port ? ':' + port : ''}`} is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.`);
    }

    debugWebServer(`Starting WebServer process ${this._options.command}...`);

    this._childProcess = spawn(this._options.command, [], {
      env: {
        ...DEFAULT_ENVIRONMENT_VARIABLES,
        ...envWithoutExperimentalLoaderOptions(),
        ...this._options.env,
      },
      cwd: this._options.cwd,
      stdio: 'pipe',
      shell: true,
    });
    this._processExitedPromise = new Promise((resolve, reject) => {
      this._childProcess!.once('exit', (code, signal) => resolve({ code, signal }));
    });

    debugWebServer(`Process started`);

    this._childProcess.stderr!.on('data', line => this._reporter!.onStdErr?.('[WebServer] ' + line.toString()));
    this._childProcess.stdout!.on('data', line => {
      if (debugWebServer.enabled)
        this._reporter!.onStdOut?.('[WebServer] ' + line.toString());
    });
    debugWebServer(`Waiting for availability...`);
    await this._waitForAvailability();
    debugWebServer(`WebServer available`);
  }

  private async _waitForAvailability() {
    const launchTimeout = this._options.timeout || 60 * 1000;
    const cancellationToken = { canceled: false };
    const { timedOut } = (await Promise.race([
      raceAgainstTimeout(() => waitFor(this._isAvailable!, cancellationToken), launchTimeout),
      this._processExitedPromise!.then(({ code, signal }) => {
        throw new Error(`Process from config.webServer terminated with exit code "${code}" and signal "${signal}"`);
      }),
    ]));
    cancellationToken.canceled = true;
    if (timedOut)
      throw new Error(`Timed out waiting ${launchTimeout}ms from config.webServer.`);
  }
}

async function isPortUsed(port: number): Promise<boolean> {
  const innerIsPortUsed = (host: string) => new Promise<boolean>(resolve => {
    const conn = net
        .connect(port, host)
        .on('error', () => {
          resolve(false);
        })
        .on('connect', () => {
          conn.end();
          resolve(true);
        });
  });
  return await innerIsPortUsed('127.0.0.1') || await innerIsPortUsed('::1');
}

async function isURLAvailable(url: URL, ignoreHTTPSErrors: boolean, onStdErr: Reporter['onStdErr']) {
  let statusCode = await httpStatusCode(url, ignoreHTTPSErrors, onStdErr);
  if (statusCode === 404 && url.pathname === '/') {
    const indexUrl = new URL(url);
    indexUrl.pathname = '/index.html';
    statusCode = await httpStatusCode(indexUrl, ignoreHTTPSErrors, onStdErr);
  }
  return statusCode >= 200 && statusCode < 404;
}

async function httpStatusCode(url: URL, ignoreHTTPSErrors: boolean, onStdErr: Reporter['onStdErr']): Promise<number> {
  const commonRequestOptions = { headers: { Accept: '*/*' } };
  const isHttps = url.protocol === 'https:';
  const requestOptions = isHttps ? {
    ...commonRequestOptions,
    rejectUnauthorized: !ignoreHTTPSErrors,
  } : commonRequestOptions;
  return new Promise(resolve => {
    debugWebServer(`HTTP GET: ${url}`);
    (isHttps ? https : http).get(url, requestOptions, res => {
      res.resume();
      const statusCode = res.statusCode ?? 0;
      debugWebServer(`HTTP Status: ${statusCode}`);
      resolve(statusCode);
    }).on('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'DEPTH_ZERO_SELF_SIGNED_CERT')
        onStdErr?.(`[WebServer] Self-signed certificate detected. Try adding ignoreHTTPSErrors: true to config.webServer.`);
      debugWebServer(`Error while checking if ${url} is available: ${error.message}`);
      resolve(0);
    });
  });
}

async function waitFor(waitFn: () => Promise<boolean>, cancellationToken: { canceled: boolean }) {
  const logScale = [100, 250, 500];
  while (!cancellationToken.canceled) {
    const connected = await waitFn();
    if (connected)
      return;
    const delay = logScale.shift() || 1000;
    debugWebServer(`Waiting ${delay}ms`);
    await new Promise(x => setTimeout(x, delay));
  }
}

function getIsAvailableFunction(url: string, checkPortOnly: boolean, ignoreHTTPSErrors: boolean, onStdErr: Reporter['onStdErr']) {
  const urlObject = new URL(url);
  if (!checkPortOnly)
    return () => isURLAvailable(urlObject, ignoreHTTPSErrors, onStdErr);
  const port = urlObject.port;
  return () => isPortUsed(+port);
}

export const webServer = (options: WebServerPluginOptions): TestRunnerPlugin => {
  // eslint-disable-next-line no-console
  return new WebServerPlugin(options, false);
};

export const webServerPluginsForConfig = (config: FullConfigInternal): TestRunnerPlugin[] => {
  const shouldSetBaseUrl = !!config.webServer;
  const webServerPlugins = [];
  for (const webServerConfig of config._webServers) {
    if (webServerConfig.port !== undefined && webServerConfig.url !== undefined)
      throw new Error(`Exactly one of 'port' or 'url' is required in config.webServer.`);

    const url = webServerConfig.url || `http://localhost:${webServerConfig.port}`;

    // We only set base url when only the port is given. That's a legacy mode we have regrets about.
    if (shouldSetBaseUrl && !webServerConfig.url)
      process.env.PLAYWRIGHT_TEST_BASE_URL = url;

    webServerPlugins.push(new WebServerPlugin({ ...webServerConfig,  url }, webServerConfig.port !== undefined));
  }

  return webServerPlugins;
};
