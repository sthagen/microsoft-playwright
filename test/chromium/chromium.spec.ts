/**
 * Copyright 2018 Google Inc. All rights reserved.
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
import { it, expect, describe } from '../fixtures';
import type { ChromiumBrowserContext } from '../..';
import http from 'http';

describe('chromium', (suite, { browserName }) => {
  suite.skip(browserName !== 'chromium');
}, () => {
  it('should create a worker from a service worker', async ({page, server, context}) => {
    const [worker] = await Promise.all([
      (context as ChromiumBrowserContext).waitForEvent('serviceworker'),
      page.goto(server.PREFIX + '/serviceworkers/empty/sw.html')
    ]);
    expect(await worker.evaluate(() => self.toString())).toBe('[object ServiceWorkerGlobalScope]');
  });

  it('serviceWorkers() should return current workers', async ({page, server, context}) => {
    const [worker1] = await Promise.all([
      (context as ChromiumBrowserContext).waitForEvent('serviceworker'),
      page.goto(server.PREFIX + '/serviceworkers/empty/sw.html')
    ]);
    let workers = (context as ChromiumBrowserContext).serviceWorkers();
    expect(workers.length).toBe(1);

    const [worker2] = await Promise.all([
      (context as ChromiumBrowserContext).waitForEvent('serviceworker'),
      page.goto(server.CROSS_PROCESS_PREFIX + '/serviceworkers/empty/sw.html')
    ]);
    workers = (context as ChromiumBrowserContext).serviceWorkers();
    expect(workers.length).toBe(2);
    expect(workers).toContain(worker1);
    expect(workers).toContain(worker2);
  });

  it('should not create a worker from a shared worker', async ({page, server, context}) => {
    await page.goto(server.EMPTY_PAGE);
    let serviceWorkerCreated;
    (context as ChromiumBrowserContext).once('serviceworker', () => serviceWorkerCreated = true);
    await page.evaluate(() => {
      new SharedWorker('data:text/javascript,console.log("hi")');
    });
    expect(serviceWorkerCreated).not.toBeTruthy();
  });

  it('should close service worker together with the context', async ({browser, server}) => {
    const context = await browser.newContext() as ChromiumBrowserContext;
    const page = await context.newPage();
    const [worker] = await Promise.all([
      context.waitForEvent('serviceworker'),
      page.goto(server.PREFIX + '/serviceworkers/empty/sw.html')
    ]);
    const messages = [];
    context.on('close', () => messages.push('context'));
    worker.on('close', () => messages.push('worker'));
    await context.close();
    expect(messages.join('|')).toBe('worker|context');
  });

  it('Page.route should work with intervention headers', async ({server, page}) => {
    server.setRoute('/intervention', (req, res) => res.end(`
      <script>
        document.write('<script src="${server.CROSS_PROCESS_PREFIX}/intervention.js">' + '</scr' + 'ipt>');
      </script>
    `));
    server.setRedirect('/intervention.js', '/redirect.js');
    let serverRequest = null;
    server.setRoute('/redirect.js', (req, res) => {
      serverRequest = req;
      res.end('console.log(1);');
    });

    await page.route('*', route => route.continue());
    await page.goto(server.PREFIX + '/intervention');
    // Check for feature URL substring rather than https://www.chromestatus.com to
    // make it work with Edgium.
    expect(serverRequest.headers.intervention).toContain('feature/5718547946799104');
  });

  it('should connect to an existing cdp session', async ({browserType, testWorkerIndex, browserOptions }) => {
    const port = 9339 + testWorkerIndex;
    const browserServer = await browserType.launch({
      ...browserOptions,
      args: ['--remote-debugging-port=' + port]
    });
    try {
      const json = await new Promise<string>((resolve, reject) => {
        http.get(`http://localhost:${port}/json/version/`, resp => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => resolve(data));
        }).on('error', reject);
      });
      const cdpBrowser = await browserType.connectOverCDP({
        wsEndpoint: JSON.parse(json).webSocketDebuggerUrl,
      });
      const contexts = cdpBrowser.contexts();
      expect(contexts.length).toBe(1);
      await cdpBrowser.close();
    } finally {
      await browserServer.close();
    }
  });

  it('should connect to an existing cdp session twice', async ({browserType, testWorkerIndex, browserOptions, server }) => {
    const port = 9339 + testWorkerIndex;
    const browserServer = await browserType.launch({
      ...browserOptions,
      args: ['--remote-debugging-port=' + port]
    });
    try {
      const json = await new Promise<string>((resolve, reject) => {
        http.get(`http://localhost:${port}/json/version/`, resp => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => resolve(data));
        }).on('error', reject);
      });
      const cdpBrowser1 = await browserType.connectOverCDP({
        wsEndpoint: JSON.parse(json).webSocketDebuggerUrl,
      });
      const cdpBrowser2 = await browserType.connectOverCDP({
        wsEndpoint: JSON.parse(json).webSocketDebuggerUrl,
      });
      const contexts1 = cdpBrowser1.contexts();
      expect(contexts1.length).toBe(1);
      const [context1] = contexts1;
      const page1 = await context1.newPage();
      await page1.goto(server.EMPTY_PAGE);

      const contexts2 = cdpBrowser2.contexts();
      expect(contexts2.length).toBe(1);
      const [context2] = contexts2;
      const page2 = await context2.newPage();
      await page2.goto(server.EMPTY_PAGE);

      expect(context1.pages().length).toBe(2);
      expect(context2.pages().length).toBe(2);

      await cdpBrowser1.close();
      await cdpBrowser2.close();
    } finally {
      await browserServer.close();
    }
  });

  it('should connect to existing service workers', async ({browserType, testWorkerIndex, browserOptions, server}) => {
    const port = 9339 + testWorkerIndex;
    const browserServer = await browserType.launch({
      ...browserOptions,
      args: ['--remote-debugging-port=' + port]
    });
    try {
      const json = await new Promise<string>((resolve, reject) => {
        http.get(`http://localhost:${port}/json/version/`, resp => {
          let data = '';
          resp.on('data', chunk => data += chunk);
          resp.on('end', () => resolve(data));
        }).on('error', reject);
      });
      const cdpBrowser1 = await browserType.connectOverCDP({
        wsEndpoint: JSON.parse(json).webSocketDebuggerUrl,
      });
      const context = cdpBrowser1.contexts()[0] as ChromiumBrowserContext;
      const page = await cdpBrowser1.contexts()[0].newPage();
      const [worker] = await Promise.all([
        context.waitForEvent('serviceworker'),
        page.goto(server.PREFIX + '/serviceworkers/empty/sw.html')
      ]);
      expect(await worker.evaluate(() => self.toString())).toBe('[object ServiceWorkerGlobalScope]');
      await cdpBrowser1.close();

      const cdpBrowser2 = await browserType.connectOverCDP({
        wsEndpoint: JSON.parse(json).webSocketDebuggerUrl,
      });
      const context2 = cdpBrowser2.contexts()[0] as ChromiumBrowserContext;
      expect(context2.serviceWorkers().length).toBe(1);
      await cdpBrowser2.close();
    } finally {
      await browserServer.close();
    }
  });
});
