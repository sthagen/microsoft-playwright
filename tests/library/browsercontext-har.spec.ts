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

import { browserTest as it, expect } from '../config/browserTest';
import fs from 'fs';

it('should fulfill from har, matching the method and following redirects', async ({ contextFactory, isAndroid, asset }) => {
  it.fixme(isAndroid);

  const path = asset('har-fulfill.har');
  const context = await contextFactory({ har: { path } });
  const page = await context.newPage();
  await page.goto('http://no.playwright/');
  // HAR contains a redirect for the script that should be followed automatically.
  expect(await page.evaluate('window.value')).toBe('foo');
  // HAR contains a POST for the css file that should not be used.
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
});

it('fallback:continue should continue when not found in har', async ({ contextFactory, server, isAndroid, asset }) => {
  it.fixme(isAndroid);

  const path = asset('har-fulfill.har');
  const context = await contextFactory({ har: { path, fallback: 'continue' } });
  const page = await context.newPage();
  await page.goto(server.PREFIX + '/one-style.html');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 192, 203)');
});

it('by default should abort requests not found in har', async ({ contextFactory, server, isAndroid, asset }) => {
  it.fixme(isAndroid);

  const path = asset('har-fulfill.har');
  const context = await contextFactory({ har: { path } });
  const page = await context.newPage();
  const error = await page.goto(server.EMPTY_PAGE).catch(e => e);
  expect(error instanceof Error).toBe(true);
});

it('fallback:continue should continue requests on bad har', async ({ contextFactory, server, isAndroid }, testInfo) => {
  it.fixme(isAndroid);

  const path = testInfo.outputPath('test.har');
  fs.writeFileSync(path, JSON.stringify({ log: {} }), 'utf-8');
  const context = await contextFactory({ har: { path, fallback: 'continue' } });
  const page = await context.newPage();
  await page.goto(server.PREFIX + '/one-style.html');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 192, 203)');
});

it('should only handle requests matching url filter', async ({ contextFactory, isAndroid, asset }) => {
  it.fixme(isAndroid);

  const path = asset('har-fulfill.har');
  const context = await contextFactory({ har: { path, urlFilter: '**/*.js' } });
  const page = await context.newPage();
  await context.route('http://no.playwright/', async route => {
    expect(route.request().url()).toBe('http://no.playwright/');
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<script src="./script.js"></script><div>hello</div>',
    });
  });
  await page.goto('http://no.playwright/');
  // HAR contains a redirect for the script that should be followed automatically.
  expect(await page.evaluate('window.value')).toBe('foo');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

it('should support regex filter', async ({ contextFactory, isAndroid, asset }) => {
  it.fixme(isAndroid);

  const path = asset('har-fulfill.har');
  const context = await contextFactory({ har: { path, urlFilter: /.*(\.js|.*\.css|no.playwright\/)$/ } });
  const page = await context.newPage();
  await page.goto('http://no.playwright/');
  expect(await page.evaluate('window.value')).toBe('foo');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
});

it('newPage should fulfill from har, matching the method and following redirects', async ({ browser, isAndroid, asset }) => {
  it.fixme(isAndroid);

  const path = asset('har-fulfill.har');
  const page = await browser.newPage({ har: { path } });
  await page.goto('http://no.playwright/');
  // HAR contains a redirect for the script that should be followed automatically.
  expect(await page.evaluate('window.value')).toBe('foo');
  // HAR contains a POST for the css file that should not be used.
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 0, 0)');
  await page.close();
});

it('should change document URL after redirected navigation', async ({ contextFactory, isAndroid, asset }) => {
  it.fixme(isAndroid);

  const path = asset('har-redirect.har');
  const context = await contextFactory({ har: { path } });
  const page = await context.newPage();
  const [response] = await Promise.all([
    page.waitForNavigation(),
    page.goto('https://theverge.com/')
  ]);
  await expect(page).toHaveURL('https://www.theverge.com/');
  expect(response.request().url()).toBe('https://www.theverge.com/');
  expect(await page.evaluate(() => location.href)).toBe('https://www.theverge.com/');
});

it('should goBack to redirected navigation', async ({ contextFactory, isAndroid, asset, server }) => {
  it.fixme(isAndroid);

  const path = asset('har-redirect.har');
  const context = await contextFactory({ har: { path, urlFilter: /.*theverge.*/ } });
  const page = await context.newPage();
  await page.goto('https://theverge.com/');
  await page.goto(server.EMPTY_PAGE);
  await expect(page).toHaveURL(server.EMPTY_PAGE);
  const response = await page.goBack();
  await expect(page).toHaveURL('https://www.theverge.com/');
  expect(response.request().url()).toBe('https://www.theverge.com/');
  expect(await page.evaluate(() => location.href)).toBe('https://www.theverge.com/');
});

it('should goForward to redirected navigation', async ({ contextFactory, isAndroid, asset, server }) => {
  it.fixme(isAndroid);

  const path = asset('har-redirect.har');
  const context = await contextFactory({ har: { path, urlFilter: /.*theverge.*/ } });
  const page = await context.newPage();
  await page.goto(server.EMPTY_PAGE);
  await expect(page).toHaveURL(server.EMPTY_PAGE);
  await page.goto('https://theverge.com/');
  await expect(page).toHaveURL('https://www.theverge.com/');
  await page.goBack();
  await expect(page).toHaveURL(server.EMPTY_PAGE);
  const response = await page.goForward();
  await expect(page).toHaveURL('https://www.theverge.com/');
  expect(response.request().url()).toBe('https://www.theverge.com/');
  expect(await page.evaluate(() => location.href)).toBe('https://www.theverge.com/');
});

it('should reload redirected navigation', async ({ contextFactory, isAndroid, asset, server }) => {
  it.fixme(isAndroid);

  const path = asset('har-redirect.har');
  const context = await contextFactory({ har: { path, urlFilter: /.*theverge.*/ } });
  const page = await context.newPage();
  await page.goto('https://theverge.com/');
  await expect(page).toHaveURL('https://www.theverge.com/');
  const response = await page.reload();
  await expect(page).toHaveURL('https://www.theverge.com/');
  expect(response.request().url()).toBe('https://www.theverge.com/');
  expect(await page.evaluate(() => location.href)).toBe('https://www.theverge.com/');
});

it('should fulfill from har with content in a file', async ({ contextFactory, isAndroid, asset }) => {
  it.fixme(isAndroid);

  const path = asset('har-sha1.har');
  const context = await contextFactory({ har: { path } });
  const page = await context.newPage();
  await page.goto('http://no.playwright/');
  expect(await page.content()).toBe('<html><head></head><body>Hello, world</body></html>');
});

it('should round-trip har.zip', async ({ contextFactory, isAndroid, server }, testInfo) => {
  it.fixme(isAndroid);

  const harPath = testInfo.outputPath('har.zip');
  const context1 = await contextFactory({ recordHar: { path: harPath } });
  const page1 = await context1.newPage();
  await page1.goto(server.PREFIX + '/one-style.html');
  await context1.close();

  const context2 = await contextFactory({ har: { path: harPath, fallback: 'abort' } });
  const page2 = await context2.newPage();
  await page2.goto(server.PREFIX + '/one-style.html');
  expect(await page2.content()).toContain('hello, world!');
  await expect(page2.locator('body')).toHaveCSS('background-color', 'rgb(255, 192, 203)');
});
