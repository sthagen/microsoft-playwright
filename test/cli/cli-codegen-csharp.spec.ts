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

import path from 'path';
import fs from 'fs';
import { folio } from './cli.fixtures';

const { it, expect } = folio;

const emptyHTML = new URL('file://' + path.join(__dirname, '..', 'assets', 'empty.html')).toString();
const launchOptions = (channel: string) => {
  return channel ? `headless: false,\n    channel: "${channel}"` : 'headless: false';
};

function capitalize(browserName: string): string {
  return browserName[0].toUpperCase() + browserName.slice(1);
}

it('should print the correct imports and context options', async ({ browserName, browserChannel, runCLI }) => {
  const cli = runCLI(['--target=csharp', emptyHTML]);
  const expectedResult = `await Playwright.InstallAsync();
using var playwright = await Playwright.CreateAsync();
await using var browser = await playwright.${capitalize(browserName)}.LaunchAsync(
    ${launchOptions(browserChannel)}
);
var context = await browser.NewContextAsync();`;
  await cli.waitFor(expectedResult).catch(e => e);
  expect(cli.text()).toContain(expectedResult);
});

it('should print the correct context options for custom settings', async ({ browserName, browserChannel, runCLI }) => {
  const cli = runCLI([
    '--color-scheme=dark',
    '--geolocation=37.819722,-122.478611',
    '--lang=es',
    '--proxy-server=http://myproxy:3128',
    '--timezone=Europe/Rome',
    '--user-agent=hardkodemium',
    '--viewport-size=1280,720',
    '--target=csharp',
    emptyHTML]);
  const expectedResult = `await Playwright.InstallAsync();
using var playwright = await Playwright.CreateAsync();
await using var browser = await playwright.${capitalize(browserName)}.LaunchAsync(
    ${launchOptions(browserChannel)},
    proxy: new ProxySettings
    {
        Server = "http://myproxy:3128",
    }
);
var context = await browser.NewContextAsync(
    viewport: new ViewportSize
    {
        Width = 1280,
        Height = 720,
    },
    geolocation: new Geolocation
    {
        Latitude = 37.819722m,
        Longitude = -122.478611m,
    },
    permissions: new[] { ContextPermission.Geolocation },
    userAgent: "hardkodemium",
    locale: "es",
    colorScheme: ColorScheme.Dark,
    timezoneId: "Europe/Rome");`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print the correct context options when using a device', (test, { browserName }) => {
  test.skip(browserName !== 'chromium');
}, async ({ browserChannel, runCLI }) => {
  const cli = runCLI(['--device=Pixel 2', '--target=csharp', emptyHTML]);
  const expectedResult = `await Playwright.InstallAsync();
using var playwright = await Playwright.CreateAsync();
await using var browser = await playwright.Chromium.LaunchAsync(
    ${launchOptions(browserChannel)}
);
var context = await browser.NewContextAsync(playwright.Devices["Pixel 2"]);`;
  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print the correct context options when using a device and additional options', (test, { browserName }) => {
  test.skip(browserName !== 'webkit');
}, async ({ browserChannel, runCLI }) => {
  const cli = runCLI([
    '--device=iPhone 11',
    '--color-scheme=dark',
    '--geolocation=37.819722,-122.478611',
    '--lang=es',
    '--proxy-server=http://myproxy:3128',
    '--timezone=Europe/Rome',
    '--user-agent=hardkodemium',
    '--viewport-size=1280,720',
    '--target=csharp',
    emptyHTML]);
  const expectedResult = `await Playwright.InstallAsync();
using var playwright = await Playwright.CreateAsync();
await using var browser = await playwright.Webkit.LaunchAsync(
    ${launchOptions(browserChannel)},
    proxy: new ProxySettings
    {
        Server = "http://myproxy:3128",
    }
);
var context = await browser.NewContextAsync(new BrowserContextOptions(playwright.Devices["iPhone 11"])
{
    UserAgent = "hardkodemium",
    Viewport = new ViewportSize
    {
        Width = 1280,
        Height = 720,
    },
    Geolocation = new Geolocation
    {
        Latitude = 37.819722m,
        Longitude = -122.478611m,
    },
    Permissions = new[] { ContextPermission.Geolocation },
    Locale = "es",
    ColorScheme = ColorScheme.Dark,
    TimezoneId = "Europe/Rome",
});`;

  await cli.waitFor(expectedResult);
  expect(cli.text()).toContain(expectedResult);
});

it('should print load/save storageState', async ({ browserName, browserChannel, runCLI, testInfo }) => {
  const loadFileName = testInfo.outputPath('load.json');
  const saveFileName = testInfo.outputPath('save.json');
  await fs.promises.writeFile(loadFileName, JSON.stringify({ cookies: [], origins: [] }), 'utf8');
  const cli = runCLI([`--load-storage=${loadFileName}`, `--save-storage=${saveFileName}`, '--target=csharp', emptyHTML]);
  const expectedResult1 = `await Playwright.InstallAsync();
using var playwright = await Playwright.CreateAsync();
await using var browser = await playwright.${capitalize(browserName)}.LaunchAsync(
    ${launchOptions(browserChannel)}
);
var context = await browser.NewContextAsync(
    storageState: "${loadFileName}");`;
  await cli.waitFor(expectedResult1);

  const expectedResult2 = `
// ---------------------
await context.StorageStateAsync(path: "${saveFileName}");
`;
  await cli.waitFor(expectedResult2);
});
