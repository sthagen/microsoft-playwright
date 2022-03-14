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

const { test: baseTest, expect } = require('@playwright/test');
const { mount } = require('@playwright/test/lib/mount');

const test = baseTest.extend({
  _workerPage: [async ({ browser }, use) => {
    const page = await browser.newPage();
    await page.addInitScript('navigator.serviceWorker.register = () => {}');
    await use(page);
  }, { scope: 'worker' }],

  context: async ({ page }, use) => {
    await use(page.context());
  },

  page: async ({ _workerPage }, use) => {
    await _workerPage.goto('about:blank');
    await use(_workerPage);
  },

  mount: async ({ page, baseURL }, use) => {
    await use(async (component, options) => {
      await page.goto(baseURL);
      const selector = await mount(page, component, options);
      return page.locator(selector);
    });
  },
});

module.exports = { test, expect };
