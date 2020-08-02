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

const utils = require('./utils');
const {FFOX, CHROMIUM, WEBKIT} = testOptions;

describe('Frame.evaluateHandle', function() {
  it('should work', async({page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    const mainFrame = page.mainFrame();
    const windowHandle = await mainFrame.evaluateHandle(() => window);
    expect(windowHandle).toBeTruthy();
  });
});

describe('Frame.frameElement', function() {
  it('should work', async({page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    const frame1 = await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE);
    const frame2 = await utils.attachFrame(page, 'frame2', server.EMPTY_PAGE);
    const frame3 = await utils.attachFrame(page, 'frame3', server.EMPTY_PAGE);
    const frame1handle1 = await page.$('#frame1');
    const frame1handle2 = await frame1.frameElement();
    const frame3handle1 = await page.$('#frame3');
    const frame3handle2 = await frame3.frameElement();
    expect(await frame1handle1.evaluate((a, b) => a === b, frame1handle2)).toBe(true);
    expect(await frame3handle1.evaluate((a, b) => a === b, frame3handle2)).toBe(true);
    expect(await frame1handle1.evaluate((a, b) => a === b, frame3handle1)).toBe(false);
  });
  it('should work with contentFrame', async({page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    const frame = await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE);
    const handle = await frame.frameElement();
    const contentFrame = await handle.contentFrame();
    expect(contentFrame).toBe(frame);
  });
  it('should throw when detached', async({page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    const frame1 = await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE);
    await page.$eval('#frame1', e => e.remove());
    const error = await frame1.frameElement().catch(e => e);
    expect(error.message).toContain('Frame has been detached.');
  });
});

describe('Frame.evaluate', function() {
  it('should throw for detached frames', async({page, server}) => {
    const frame1 = await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE);
    await utils.detachFrame(page, 'frame1');
    let error = null;
    await frame1.evaluate(() => 7 * 8).catch(e => error = e);
    expect(error.message).toContain('Execution Context is not available in detached frame');
  });
  it('should be isolated between frames', async({page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE);
    expect(page.frames().length).toBe(2);
    const [frame1, frame2] = page.frames();
    expect(frame1 !== frame2).toBeTruthy();

    await Promise.all([
      frame1.evaluate(() => window.a = 1),
      frame2.evaluate(() => window.a = 2)
    ]);
    const [a1, a2] = await Promise.all([
      frame1.evaluate(() => window.a),
      frame2.evaluate(() => window.a)
    ]);
    expect(a1).toBe(1);
    expect(a2).toBe(2);
  });
  it.fail(CHROMIUM || FFOX)('should work in iframes that failed initial navigation', async({page, server}) => {
    // - Firefox does not report domcontentloaded for the iframe.
    // - Chromium and Firefox report empty url.
    // - Chromium does not report main/utility worlds for the iframe.
    await page.setContent(`
      <meta http-equiv="Content-Security-Policy" content="script-src 'none';">
      <iframe src='javascript:""'></iframe>
    `, { waitUntil: 'domcontentloaded' });
    // Note: Chromium/Firefox never report 'load' event for the iframe.
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe');
      const div = iframe.contentDocument.createElement('div');
      iframe.contentDocument.body.appendChild(div);
    });
    expect(page.frames()[1].url()).toBe('about:blank');
    // Main world should work.
    expect(await page.frames()[1].evaluate(() => window.location.href)).toBe('about:blank');
    // Utility world should work.
    expect(await page.frames()[1].$('div')).toBeTruthy();
  });
  it.fail(CHROMIUM)('should work in iframes that interrupted initial javascript url navigation', async({page, server}) => {
    // Chromium does not report isolated world for the iframe.
    await page.goto(server.EMPTY_PAGE);
    await page.evaluate(() => {
      const iframe = document.createElement('iframe');
      iframe.src = 'javascript:""';
      document.body.appendChild(iframe);
      iframe.contentDocument.open();
      iframe.contentDocument.write('<div>hello</div>');
      iframe.contentDocument.close();
    });
    // Main world should work.
    expect(await page.frames()[1].evaluate(() => window.top.location.href)).toBe(server.EMPTY_PAGE);
    // Utility world should work.
    expect(await page.frames()[1].$('div')).toBeTruthy();
  });
});

describe('Frame Management', function() {
  it('should handle nested frames', async({page, server}) => {
    await page.goto(server.PREFIX + '/frames/nested-frames.html');
    expect(utils.dumpFrames(page.mainFrame())).toEqual([
      'http://localhost:<PORT>/frames/nested-frames.html',
      '    http://localhost:<PORT>/frames/frame.html (aframe)',
      '    http://localhost:<PORT>/frames/two-frames.html (2frames)',
      '        http://localhost:<PORT>/frames/frame.html (dos)',
      '        http://localhost:<PORT>/frames/frame.html (uno)',
    ]);
  });
  it('should send events when frames are manipulated dynamically', async({page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    // validate frameattached events
    const attachedFrames = [];
    page.on('frameattached', frame => attachedFrames.push(frame));
    await utils.attachFrame(page, 'frame1', './assets/frame.html');
    expect(attachedFrames.length).toBe(1);
    expect(attachedFrames[0].url()).toContain('/assets/frame.html');

    // validate framenavigated events
    const navigatedFrames = [];
    page.on('framenavigated', frame => navigatedFrames.push(frame));
    await page.evaluate(() => {
      const frame = document.getElementById('frame1');
      frame.src = './empty.html';
      return new Promise(x => frame.onload = x);
    });
    expect(navigatedFrames.length).toBe(1);
    expect(navigatedFrames[0].url()).toBe(server.EMPTY_PAGE);

    // validate framedetached events
    const detachedFrames = [];
    page.on('framedetached', frame => detachedFrames.push(frame));
    await utils.detachFrame(page, 'frame1');
    expect(detachedFrames.length).toBe(1);
    expect(detachedFrames[0].isDetached()).toBe(true);
  });
  it('should send "framenavigated" when navigating on anchor URLs', async({page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    await Promise.all([
      page.goto(server.EMPTY_PAGE + '#foo'),
      page.waitForEvent('framenavigated')
    ]);
    expect(page.url()).toBe(server.EMPTY_PAGE + '#foo');
  });
  it('should persist mainFrame on cross-process navigation', async({page, server}) => {
    await page.goto(server.EMPTY_PAGE);
    const mainFrame = page.mainFrame();
    await page.goto(server.CROSS_PROCESS_PREFIX + '/empty.html');
    expect(page.mainFrame() === mainFrame).toBeTruthy();
  });
  it('should not send attach/detach events for main frame', async({page, server}) => {
    let hasEvents = false;
    page.on('frameattached', frame => hasEvents = true);
    page.on('framedetached', frame => hasEvents = true);
    await page.goto(server.EMPTY_PAGE);
    expect(hasEvents).toBe(false);
  });
  it('should detach child frames on navigation', async({page, server}) => {
    let attachedFrames = [];
    let detachedFrames = [];
    let navigatedFrames = [];
    page.on('frameattached', frame => attachedFrames.push(frame));
    page.on('framedetached', frame => detachedFrames.push(frame));
    page.on('framenavigated', frame => navigatedFrames.push(frame));
    await page.goto(server.PREFIX + '/frames/nested-frames.html');
    expect(attachedFrames.length).toBe(4);
    expect(detachedFrames.length).toBe(0);
    expect(navigatedFrames.length).toBe(5);

    attachedFrames = [];
    detachedFrames = [];
    navigatedFrames = [];
    await page.goto(server.EMPTY_PAGE);
    expect(attachedFrames.length).toBe(0);
    expect(detachedFrames.length).toBe(4);
    expect(navigatedFrames.length).toBe(1);
  });
  it('should support framesets', async({page, server}) => {
    let attachedFrames = [];
    let detachedFrames = [];
    let navigatedFrames = [];
    page.on('frameattached', frame => attachedFrames.push(frame));
    page.on('framedetached', frame => detachedFrames.push(frame));
    page.on('framenavigated', frame => navigatedFrames.push(frame));
    await page.goto(server.PREFIX + '/frames/frameset.html');
    expect(attachedFrames.length).toBe(4);
    expect(detachedFrames.length).toBe(0);
    expect(navigatedFrames.length).toBe(5);

    attachedFrames = [];
    detachedFrames = [];
    navigatedFrames = [];
    await page.goto(server.EMPTY_PAGE);
    expect(attachedFrames.length).toBe(0);
    expect(detachedFrames.length).toBe(4);
    expect(navigatedFrames.length).toBe(1);
  });
  it('should report frame from-inside shadow DOM', async({page, server}) => {
    await page.goto(server.PREFIX + '/shadow.html');
    await page.evaluate(async url => {
      const frame = document.createElement('iframe');
      frame.src = url;
      document.body.shadowRoot.appendChild(frame);
      await new Promise(x => frame.onload = x);
    }, server.EMPTY_PAGE);
    expect(page.frames().length).toBe(2);
    expect(page.frames()[1].url()).toBe(server.EMPTY_PAGE);
  });
  it('should report frame.name()', async({page, server}) => {
    await utils.attachFrame(page, 'theFrameId', server.EMPTY_PAGE);
    await page.evaluate(url => {
      const frame = document.createElement('iframe');
      frame.name = 'theFrameName';
      frame.src = url;
      document.body.appendChild(frame);
      return new Promise(x => frame.onload = x);
    }, server.EMPTY_PAGE);
    expect(page.frames()[0].name()).toBe('');
    expect(page.frames()[1].name()).toBe('theFrameId');
    expect(page.frames()[2].name()).toBe('theFrameName');
  });
  it('should report frame.parent()', async({page, server}) => {
    await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE);
    await utils.attachFrame(page, 'frame2', server.EMPTY_PAGE);
    expect(page.frames()[0].parentFrame()).toBe(null);
    expect(page.frames()[1].parentFrame()).toBe(page.mainFrame());
    expect(page.frames()[2].parentFrame()).toBe(page.mainFrame());
  });
  it('should report different frame instance when frame re-attaches', async({page, server}) => {
    const frame1 = await utils.attachFrame(page, 'frame1', server.EMPTY_PAGE);
    await page.evaluate(() => {
      window.frame = document.querySelector('#frame1');
      window.frame.remove();
    });
    expect(frame1.isDetached()).toBe(true);
    const [frame2] = await Promise.all([
      page.waitForEvent('frameattached'),
      page.evaluate(() => document.body.appendChild(window.frame)),
    ]);
    expect(frame2.isDetached()).toBe(false);
    expect(frame1).not.toBe(frame2);
  });
  it.fail(FFOX)('should refuse to display x-frame-options:deny iframe', async({page, server}) => {
    server.setRoute('/x-frame-options-deny.html', async (req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('X-Frame-Options', 'DENY');
      res.end(`<!DOCTYPE html><html><head><title>login</title></head><body style="background-color: red;"><p>dangerous login page</p></body></html>`);
    });
    await page.goto(server.EMPTY_PAGE);
    const refusalText = new Promise(f => {
      page.on('console', msg => {
        if (msg.text().match(/Refused to display/i))
          f(msg.text());
      });
    });
    await page.setContent(`<iframe src="${server.CROSS_PROCESS_PREFIX}/x-frame-options-deny.html"></iframe>`);
    expect(await refusalText).toMatch(/Refused to display 'http.*\/x-frame-options-deny\.html' in a frame because it set 'X-Frame-Options' to 'deny'./i)
  });
});
