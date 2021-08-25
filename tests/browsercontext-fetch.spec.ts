/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
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

import http from 'http';
import { contextTest as it, expect } from './config/browserTest';

it.skip(({ mode }) => mode !== 'default');

let prevAgent: http.Agent;
it.beforeAll(() => {
  prevAgent = http.globalAgent;
  http.globalAgent = new http.Agent({
    // @ts-expect-error
    lookup: (hostname, options, callback) => {
      if (hostname === 'localhost' || hostname.endsWith('playwright.dev'))
        callback(null, '127.0.0.1', 4);
      else
        throw new Error(`Failed to resolve hostname: ${hostname}`);
    }
  });
});

it.afterAll(() => {
  http.globalAgent = prevAgent;
});

it('should work', async ({context, server}) => {
  // @ts-expect-error
  const response = await context._fetch(server.PREFIX + '/simple.json');
  expect(response.url()).toBe(server.PREFIX + '/simple.json');
  expect(response.status()).toBe(200);
  expect(response.statusText()).toBe('OK');
  expect(response.ok()).toBeTruthy();
  expect(response.url()).toBe(server.PREFIX + '/simple.json');
  expect(response.headers()['content-type']).toBe('application/json; charset=utf-8');
  expect(await response.text()).toBe('{"foo": "bar"}\n');
});

it('should add session cookies to request', async ({context, server}) => {
  await context.addCookies([{
    name: 'username',
    value: 'John Doe',
    domain: '.my.playwright.dev',
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }]);
  const [req] = await Promise.all([
    server.waitForRequest('/simple.json'),
    // @ts-expect-error
    context._fetch(`http://www.my.playwright.dev:${server.PORT}/simple.json`),
  ]);
  expect(req.headers.cookie).toEqual('username=John Doe');
});

it('should follow redirects', async ({context, server}) => {
  server.setRedirect('/redirect1', '/redirect2');
  server.setRedirect('/redirect2', '/simple.json');
  await context.addCookies([{
    name: 'username',
    value: 'John Doe',
    domain: '.my.playwright.dev',
    path: '/',
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: 'Lax',
  }]);
  const [req, response] = await Promise.all([
    server.waitForRequest('/simple.json'),
    // @ts-expect-error
    context._fetch(`http://www.my.playwright.dev:${server.PORT}/redirect1`),
  ]);
  expect(req.headers.cookie).toEqual('username=John Doe');
  expect(response.url()).toBe(`http://www.my.playwright.dev:${server.PORT}/simple.json`);
  expect(await response.json()).toEqual({foo: 'bar'});
});

it('should add cookies from Set-Cookie header', async ({context, page, server}) => {
  server.setRoute('/setcookie.html', (req, res) => {
    res.setHeader('Set-Cookie', ['session=value', 'foo=bar; max-age=3600']);
    res.end();
  });
  // @ts-expect-error
  await context._fetch(server.PREFIX + '/setcookie.html');
  const cookies = await context.cookies();
  expect(new Set(cookies.map(c => ({ name: c.name, value: c.value })))).toEqual(new Set([
    {
      name: 'session',
      value: 'value'
    },
    {
      name: 'foo',
      value: 'bar'
    },
  ]));
  await page.goto(server.EMPTY_PAGE);
  expect((await page.evaluate(() => document.cookie)).split(';').map(s => s.trim()).sort()).toEqual(['foo=bar', 'session=value']);
});

it('should work with context level proxy', async ({browserOptions, browserType, contextOptions, server, proxyServer}) => {
  server.setRoute('/target.html', async (req, res) => {
    res.end('<title>Served by the proxy</title>');
  });

  const browser = await browserType.launch({
    ...browserOptions,
    proxy: { server: 'http://per-context' }
  });

  try {
    proxyServer.forwardTo(server.PORT);
    const context = await browser.newContext({
      ...contextOptions,
      proxy: { server: `localhost:${proxyServer.PORT}` }
    });

    const [request, response] = await Promise.all([
      server.waitForRequest('/target.html'),
      // @ts-expect-error
      context._fetch(`http://non-existent.com/target.html`)
    ]);
    expect(response.status()).toBe(200);
    expect(request.url).toBe('/target.html');
  } finally {
    await browser.close();
  }
});

it('should work with http credentials', async ({context, server}) => {
  server.setAuth('/empty.html', 'user', 'pass');

  const [request, response] = await Promise.all([
    server.waitForRequest('/empty.html'),
    // @ts-expect-error
    context._fetch(server.EMPTY_PAGE, {
      headers: {
        'authorization': 'Basic ' + Buffer.from('user:pass').toString('base64')
      }
    })
  ]);
  expect(response.status()).toBe(200);
  expect(request.url).toBe('/empty.html');
});

it('should support post data', async ({context, server}) => {
  const [request, response] = await Promise.all([
    server.waitForRequest('/simple.json'),
    // @ts-expect-error
    context._fetch(`${server.PREFIX}/simple.json`, {
      method: 'POST',
      postData: 'My request'
    })
  ]);
  expect(request.method).toBe('POST');
  expect((await request.postBody).toString()).toBe('My request');
  expect(response.status()).toBe(200);
  expect(request.url).toBe('/simple.json');
});
