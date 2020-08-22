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

import { options } from './playwright.fixtures';
import utils from './utils';
import path from 'path';
import fs from 'fs';

// Firefox headful produces a different image.
const ffheadful = options.FIREFOX && !options.HEADLESS;

it.skip(ffheadful)('should work', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  const screenshot = await page.screenshot();
  expect(screenshot).toMatchImage(golden('screenshot-sanity.png'));
});

it.skip(ffheadful)('should clip rect', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  const screenshot = await page.screenshot({
    clip: {
      x: 50,
      y: 100,
      width: 150,
      height: 100
    }
  });
  expect(screenshot).toMatchImage(golden('screenshot-clip-rect.png'));
});

it.skip(ffheadful)('should clip rect with fullPage', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  await page.evaluate(() => window.scrollBy(150, 200));
  const screenshot = await page.screenshot({
    fullPage: true,
    clip: {
      x: 50,
      y: 100,
      width: 150,
      height: 100,
    },
  });
  expect(screenshot).toMatchImage(golden('screenshot-clip-rect.png'));
});

it.skip(ffheadful)('should clip elements to the viewport', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  const screenshot = await page.screenshot({
    clip: {
      x: 50,
      y: 450,
      width: 1000,
      height: 100
    }
  });
  expect(screenshot).toMatchImage(golden('screenshot-offscreen-clip.png'));
});

it.skip(ffheadful)('should throw on clip outside the viewport', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  const screenshotError = await page.screenshot({
    clip: {
      x: 50,
      y: 650,
      width: 100,
      height: 100
    }
  }).catch(error => error);
  expect(screenshotError.message).toContain('Clipped area is either empty or outside the resulting image');
});

it.skip(ffheadful)('should run in parallel', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  const promises = [];
  for (let i = 0; i < 3; ++i) {
    promises.push(page.screenshot({
      clip: {
        x: 50 * i,
        y: 0,
        width: 50,
        height: 50
      }
    }));
  }
  const screenshots = await Promise.all(promises);
  expect(screenshots[1]).toMatchImage(golden('grid-cell-1.png'));
});

it.skip(ffheadful)('should take fullPage screenshots', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  const screenshot = await page.screenshot({
    fullPage: true
  });
  expect(screenshot).toMatchImage(golden('screenshot-grid-fullpage.png'));
});

it.skip(ffheadful)('should restore viewport after fullPage screenshot', async({page, server}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot).toBeInstanceOf(Buffer);
  await utils.verifyViewport(page, 500, 500);
});

it.skip(ffheadful)('should run in parallel in multiple pages', async({server, context, golden}) => {
  const N = 5;
  const pages = await Promise.all(Array(N).fill(0).map(async() => {
    const page = await context.newPage();
    await page.goto(server.PREFIX + '/grid.html');
    return page;
  }));
  const promises = [];
  for (let i = 0; i < N; ++i)
    promises.push(pages[i].screenshot({ clip: { x: 50 * (i % 2), y: 0, width: 50, height: 50 } }));
  const screenshots = await Promise.all(promises);
  for (let i = 0; i < N; ++i)
    expect(screenshots[i]).toMatchImage(golden(`grid-cell-${i % 2}.png`));
  await Promise.all(pages.map(page => page.close()));
});

it.fail(options.FIREFOX)('should allow transparency', async({page, golden}) => {
  await page.setViewportSize({ width: 50, height: 150 });
  await page.setContent(`
    <style>
      body { margin: 0 }
      div { width: 50px; height: 50px; }
    </style>
    <div style="background:black"></div>
    <div style="background:white"></div>
    <div style="background:transparent"></div>
  `);
  const screenshot = await page.screenshot({omitBackground: true});
  expect(screenshot).toMatchImage(golden('transparent.png'));
});

it.skip(ffheadful)('should render white background on jpeg file', async({page, server, golden}) => {
  await page.setViewportSize({ width: 100, height: 100 });
  await page.goto(server.EMPTY_PAGE);
  const screenshot = await page.screenshot({omitBackground: true, type: 'jpeg'});
  expect(screenshot).toMatchImage(golden('white.jpg'));
});

it.skip(ffheadful)('should work with odd clip size on Retina displays', async({page, golden}) => {
  const screenshot = await page.screenshot({
    clip: {
      x: 0,
      y: 0,
      width: 11,
      height: 11,
    }
  });
  expect(screenshot).toMatchImage(golden('screenshot-clip-odd-size.png'));
});

it.skip(options.FIREFOX)('should work with a mobile viewport', async({browser, server, golden}) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 480 }, isMobile: true });
  const page = await context.newPage();
  await page.goto(server.PREFIX + '/overflow.html');
  const screenshot = await page.screenshot();
  expect(screenshot).toMatchImage(golden('screenshot-mobile.png'));
  await context.close();
});

it.skip(options.FIREFOX)('should work with a mobile viewport and clip', async({browser, server, golden}) => {
  const context = await browser.newContext({viewport: { width: 320, height: 480 }, isMobile: true});
  const page = await context.newPage();
  await page.goto(server.PREFIX + '/overflow.html');
  const screenshot = await page.screenshot({ clip: { x: 10, y: 10, width: 100, height: 150 } });
  expect(screenshot).toMatchImage(golden('screenshot-mobile-clip.png'));
  await context.close();
});

it.skip(options.FIREFOX)('should work with a mobile viewport and fullPage', async({browser, server, golden}) => {
  const context = await browser.newContext({viewport: { width: 320, height: 480 }, isMobile: true});
  const page = await context.newPage();
  await page.goto(server.PREFIX + '/overflow-large.html');
  const screenshot = await page.screenshot({ fullPage: true });
  expect(screenshot).toMatchImage(golden('screenshot-mobile-fullpage.png'));
  await context.close();
});

it.skip(ffheadful)('should work for canvas', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/screenshots/canvas.html');
  const screenshot = await page.screenshot();
  expect(screenshot).toMatchImage(golden('screenshot-canvas.png'), { threshold: 0.3 });
});

it.skip(ffheadful)('should work for translateZ', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/screenshots/translateZ.html');
  const screenshot = await page.screenshot();
  expect(screenshot).toMatchImage(golden('screenshot-translateZ.png'));
});

it.fail(options.FIREFOX || options.WEBKIT)('should work for webgl', async({page, server, golden}) => {
  await page.setViewportSize({width: 640, height: 480});
  await page.goto(server.PREFIX + '/screenshots/webgl.html');
  const screenshot = await page.screenshot();
  expect(screenshot).toMatchImage(golden('screenshot-webgl.png'));
});

it.skip(ffheadful)('should work while navigating', async({page, server}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/redirectloop1.html');
  for (let i = 0; i < 10; i++) {
    const screenshot = await page.screenshot({ fullPage: true }).catch(e => {
      if (e.message.includes('Cannot take a screenshot while page is navigating'))
        return Buffer.from('');
      throw e;
    });
    expect(screenshot).toBeInstanceOf(Buffer);
  }
});

it.skip(ffheadful)('should work with device scale factor', async({browser, server, golden}) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 480 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(server.PREFIX + '/grid.html');
  const screenshot = await page.screenshot();
  expect(screenshot).toMatchImage(golden('screenshot-device-scale-factor.png'));
  await context.close();
});

it.skip(ffheadful)('should work with iframe in shadow', async({page, server, golden}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid-iframe-in-shadow.html');
  expect(await page.screenshot()).toMatchImage(golden('screenshot-iframe.png'));
});

it.skip(ffheadful)('path option should work', async({page, server, golden, tmpDir}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  const outputPath = path.join(tmpDir, 'screenshot.png');
  await page.screenshot({path: outputPath});
  expect(await fs.promises.readFile(outputPath)).toMatchImage(golden('screenshot-sanity.png'));
});

it.skip(ffheadful)('path option should create subdirectories', async({page, server, golden, tmpDir}) => {
  await page.setViewportSize({width: 500, height: 500});
  await page.goto(server.PREFIX + '/grid.html');
  const outputPath = path.join(tmpDir, 'these', 'are', 'directories', 'screenshot.png');
  await page.screenshot({path: outputPath});
  expect(await fs.promises.readFile(outputPath)).toMatchImage(golden('screenshot-sanity.png'));
});

it.skip(ffheadful)('path option should detect jpeg', async({page, server, golden, tmpDir}) => {
  await page.setViewportSize({ width: 100, height: 100 });
  await page.goto(server.EMPTY_PAGE);
  const outputPath = path.join(tmpDir, 'screenshot.jpg');
  const screenshot = await page.screenshot({omitBackground: true, path: outputPath});
  expect(await fs.promises.readFile(outputPath)).toMatchImage(golden('white.jpg'));
  expect(screenshot).toMatchImage(golden('white.jpg'));
});

it.skip(ffheadful)('path option should throw for unsupported mime type', async({page, server, golden, tmpDir}) => {
  const error = await page.screenshot({ path: 'file.txt' }).catch(e => e);
  expect(error.message).toContain('path: unsupported mime type "text/plain"');
});
