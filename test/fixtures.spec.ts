/**
 * Copyright 2019 Google Inc. All rights reserved.
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

import { it, expect, describe, options } from './playwright.fixtures';
import './remoteServer.fixture';
import { registerFixture } from '@playwright/test-runner';

import { execSync } from 'child_process';
import path from 'path';

declare global {
  interface TestState {
    connectedRemoteServer: TestState['remoteServer'];
    stallingConnectedRemoteServer: TestState['stallingRemoteServer'];
  }
}

registerFixture('connectedRemoteServer', async ({browserType, remoteServer, server}, test) => {
  const browser = await browserType.connect({ wsEndpoint: remoteServer.wsEndpoint() });
  const page = await browser.newPage();
  await page.goto(server.EMPTY_PAGE);
  await test(remoteServer);
  await browser.close();
});

registerFixture('stallingConnectedRemoteServer', async ({browserType, stallingRemoteServer, server}, test) => {
  const browser = await browserType.connect({ wsEndpoint: stallingRemoteServer.wsEndpoint() });
  const page = await browser.newPage();
  await page.goto(server.EMPTY_PAGE);
  await test(stallingRemoteServer);
  await browser.close();
});

it('should close the browser when the node process closes', test => {
  test.slow();
}, async ({connectedRemoteServer}) => {
  if (WIN)
    execSync(`taskkill /pid ${connectedRemoteServer.child().pid} /T /F`);
  else
    process.kill(connectedRemoteServer.child().pid);
  expect(await connectedRemoteServer.childExitCode()).toBe(WIN ? 1 : 0);
  // We might not get browser exitCode in time when killing the parent node process,
  // so we don't check it here.
});

describe('fixtures', suite => {
  suite.skip(WIN || !options.HEADLESS);
  suite.slow();
}, () => {
  // Cannot reliably send signals on Windows.
  it('should report browser close signal', async ({connectedRemoteServer}) => {
    const pid = await connectedRemoteServer.out('pid');
    process.kill(-pid, 'SIGTERM');
    expect(await connectedRemoteServer.out('exitCode')).toBe('null');
    expect(await connectedRemoteServer.out('signal')).toBe('SIGTERM');
    process.kill(connectedRemoteServer.child().pid);
    await connectedRemoteServer.childExitCode();
  });

  it('should report browser close signal 2', async ({connectedRemoteServer}) => {
    const pid = await connectedRemoteServer.out('pid');
    process.kill(-pid, 'SIGKILL');
    expect(await connectedRemoteServer.out('exitCode')).toBe('null');
    expect(await connectedRemoteServer.out('signal')).toBe('SIGKILL');
    process.kill(connectedRemoteServer.child().pid);
    await connectedRemoteServer.childExitCode();
  });

  it('should close the browser on SIGINT', async ({connectedRemoteServer}) => {
    process.kill(connectedRemoteServer.child().pid, 'SIGINT');
    expect(await connectedRemoteServer.out('exitCode')).toBe('0');
    expect(await connectedRemoteServer.out('signal')).toBe('null');
    expect(await connectedRemoteServer.childExitCode()).toBe(130);
  });

  it('should close the browser on SIGTERM', async ({connectedRemoteServer}) => {
    process.kill(connectedRemoteServer.child().pid, 'SIGTERM');
    expect(await connectedRemoteServer.out('exitCode')).toBe('0');
    expect(await connectedRemoteServer.out('signal')).toBe('null');
    expect(await connectedRemoteServer.childExitCode()).toBe(0);
  });

  it('should close the browser on SIGHUP', async ({connectedRemoteServer}) => {
    process.kill(connectedRemoteServer.child().pid, 'SIGHUP');
    expect(await connectedRemoteServer.out('exitCode')).toBe('0');
    expect(await connectedRemoteServer.out('signal')).toBe('null');
    expect(await connectedRemoteServer.childExitCode()).toBe(0);
  });

  it('should kill the browser on double SIGINT', async ({stallingConnectedRemoteServer}) => {
    process.kill(stallingConnectedRemoteServer.child().pid, 'SIGINT');
    await stallingConnectedRemoteServer.out('stalled');
    process.kill(stallingConnectedRemoteServer.child().pid, 'SIGINT');
    expect(await stallingConnectedRemoteServer.out('exitCode')).toBe('null');
    expect(await stallingConnectedRemoteServer.out('signal')).toBe('SIGKILL');
    expect(await stallingConnectedRemoteServer.childExitCode()).toBe(130);
  });

  it('should kill the browser on SIGINT + SIGTERM', async ({stallingConnectedRemoteServer}) => {
    process.kill(stallingConnectedRemoteServer.child().pid, 'SIGINT');
    await stallingConnectedRemoteServer.out('stalled');
    process.kill(stallingConnectedRemoteServer.child().pid, 'SIGTERM');
    expect(await stallingConnectedRemoteServer.out('exitCode')).toBe('null');
    expect(await stallingConnectedRemoteServer.out('signal')).toBe('SIGKILL');
    expect(await stallingConnectedRemoteServer.childExitCode()).toBe(0);
  });

  it('should kill the browser on SIGTERM + SIGINT', async ({stallingConnectedRemoteServer}) => {
    process.kill(stallingConnectedRemoteServer.child().pid, 'SIGTERM');
    await stallingConnectedRemoteServer.out('stalled');
    process.kill(stallingConnectedRemoteServer.child().pid, 'SIGINT');
    expect(await stallingConnectedRemoteServer.out('exitCode')).toBe('null');
    expect(await stallingConnectedRemoteServer.out('signal')).toBe('SIGKILL');
    expect(await stallingConnectedRemoteServer.childExitCode()).toBe(130);
  });
});

it('caller file path', async ({}) => {
  const stackTrace = require(path.join(__dirname, '..', 'lib', 'utils', 'stackTrace'));
  const callme = require('./fixtures/callback');
  const filePath = callme(() => {
    return stackTrace.getCallerFilePath(path.join(__dirname, 'fixtures') + path.sep);
  });
  expect(filePath).toBe(__filename);
});
