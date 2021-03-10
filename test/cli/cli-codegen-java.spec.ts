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

import fs from 'fs';
import path from 'path';
import { folio } from './cli.fixtures';

const { it, expect } = folio;

const emptyHTML = new URL('file://' + path.join(__dirname, '..', 'assets', 'empty.html')).toString();

it('should print the correct imports and context options', async ({ runCLI, browserName }) => {
  const cli = runCLI(['codegen', '--target=java', emptyHTML]);
  const expectedResult = `import com.microsoft.playwright.*;
import com.microsoft.playwright.options.*;

public class Example {
  public static void main(String[] args) {
    try (Playwright playwright = Playwright.create()) {
      Browser browser = playwright.${browserName}().launch(new BrowserType.LaunchOptions()
        .setHeadless(false));
      BrowserContext context = browser.newContext();`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print the correct context options for custom settings', async ({ runCLI, browserName }) => {
  const cli = runCLI(['codegen', '--color-scheme=light', '--target=java', emptyHTML]);
  const expectedResult = `BrowserContext context = browser.newContext(new Browser.NewContextOptions()
        .setColorScheme(ColorScheme.LIGHT));`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print the correct context options when using a device', async ({ runCLI }) => {
  const cli = runCLI(['codegen', '--device=Pixel 2', '--target=java', emptyHTML]);
  const expectedResult = `BrowserContext context = browser.newContext(new Browser.NewContextOptions()
        .setUserAgent("Mozilla/5.0 (Linux; Android 8.0; Pixel 2 Build/OPD3.170816.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3765.0 Mobile Safari/537.36")
        .setViewportSize(411, 731)
        .setDeviceScaleFactor(2.625)
        .setIsMobile(true)
        .setHasTouch(true));`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print the correct context options when using a device and additional options', async ({ runCLI }) => {
  const cli = runCLI(['codegen', '--color-scheme=light', '--device=iPhone 11', '--target=java', emptyHTML]);
  const expectedResult = `BrowserContext context = browser.newContext(new Browser.NewContextOptions()
        .setColorScheme(ColorScheme.LIGHT)
        .setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Mobile/15E148 Safari/604.1")
        .setViewportSize(414, 896)
        .setDeviceScaleFactor(2)
        .setIsMobile(true)
        .setHasTouch(true));`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print load/save storage_state', async ({ runCLI, browserName, testInfo }) => {
  const loadFileName = testInfo.outputPath('load.json');
  const saveFileName = testInfo.outputPath('save.json');
  await fs.promises.writeFile(loadFileName, JSON.stringify({ cookies: [], origins: [] }), 'utf8');
  const cli = runCLI(['codegen', `--load-storage=${loadFileName}`, `--save-storage=${saveFileName}`, '--target=java', emptyHTML]);
  const expectedResult1 = `BrowserContext context = browser.newContext(new Browser.NewContextOptions()
        .setStorageStatePath(Paths.get("${loadFileName}")));`;
  await cli.waitFor(expectedResult1);

  const expectedResult2 = `
      // ---------------------
      context.storageState(new BrowserContext.StorageStateOptions().setPath("${saveFileName}"))`;
  await cli.waitFor(expectedResult2);
});
