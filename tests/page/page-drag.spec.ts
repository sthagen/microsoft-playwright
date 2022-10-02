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

import type { ElementHandle, Route } from 'playwright-core';
import { test as it, expect } from './pageTest';
import { attachFrame } from '../config/utils';

it.describe('Drag and drop', () => {
  it.skip(({ browserName, browserMajorVersion }) => browserName === 'chromium' && browserMajorVersion < 91);

  it('should work @smoke', async ({ page, server }) => {
    await page.goto(server.PREFIX + '/drag-n-drop.html');
    await page.hover('#source');
    await page.mouse.down();
    await page.hover('#target');
    await page.mouse.up();
    expect(await page.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(true); // could not find source in target
  });

  it('should send the right events', async ({ server, page, browserName }) => {
    await page.goto(server.PREFIX + '/drag-n-drop.html');
    const events = await trackEvents(await page.$('body'));
    await page.hover('#source');
    await page.mouse.down();
    await page.hover('#target');
    await page.mouse.up();
    expect(await events.jsonValue()).toEqual(browserName === 'firefox' ? [
      'mousemove at 121;87',
      'mousedown at 121;87',
      'dragstart at 121;87',
      'mousemove at 241;351',
      'dragenter at 0;0',
      'dragover at 0;0',
      'drop at 0;0',
      'dragend',
    ] : [
      'mousemove at 121;87',
      'mousedown at 121;87',
      'mousemove at 241;351',
      'dragstart at 121;87',
      'dragenter at 241;351',
      'dragover at 241;351',
      'drop at 241;351',
      'dragend',
    ]);
  });

  it('should not send dragover on the first mousemove', async ({ server, page, browserName }) => {
    it.fixme(browserName !== 'chromium');

    await page.goto(server.PREFIX + '/drag-n-drop.html');
    const events = await trackEvents(await page.$('body'));
    await page.hover('#source');
    await page.mouse.down();
    await page.hover('#target');
    expect(await events.jsonValue()).toEqual(browserName === 'firefox' ? [
      'mousemove at 121;87',
      'mousedown at 121;87',
      'dragstart at 121;87',
      'mousemove at 241;351',
      'dragenter at 0;0',
    ] : [
      'mousemove at 121;87',
      'mousedown at 121;87',
      'mousemove at 241;351',
      'dragstart at 121;87',
      'dragenter at 241;351',
    ]);
  });

  it('should work inside iframe', async ({ page, server, browserName }) => {
    await page.goto(server.EMPTY_PAGE);
    const frame = await attachFrame(page, 'myframe', server.PREFIX + '/drag-n-drop.html');
    await page.$eval('iframe', iframe => {
      iframe.style.width = '500px';
      iframe.style.height = '600px';
      iframe.style.marginLeft = '80px';
      iframe.style.marginTop = '60px';
    });
    const pageEvents = await trackEvents(await page.$('body'));
    const frameEvents = await trackEvents(await frame.$('body'));
    await frame.hover('#source');
    await page.mouse.down();
    await frame.hover('#target');
    await page.mouse.up();
    expect(await frame.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(true); // could not find source in target
    expect(await frameEvents.jsonValue()).toEqual(browserName === 'firefox' ? [
      'mousemove at 121;87',
      'mousedown at 121;87',
      'dragstart at 121;87',
      'mousemove at 241;351',
      'dragenter at 0;0',
      'dragover at 0;0',
      'drop at 0;0',
      'dragend',
    ] : [
      'mousemove at 121;87',
      'mousedown at 121;87',
      'mousemove at 241;351',
      'dragstart at 121;87',
      'dragenter at 241;351',
      'dragover at 241;351',
      'drop at 241;351',
      'dragend',
    ]);
    expect(await pageEvents.jsonValue()).toEqual([]);
  });

  it('should cancel on escape', async ({ server, page, browserName }) => {
    await page.goto(server.PREFIX + '/drag-n-drop.html');
    const events = await trackEvents(await page.$('body'));
    await page.hover('#source');
    await page.mouse.down();
    await page.hover('#target');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await page.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(false); // found source in target
    expect(await events.jsonValue()).toEqual(browserName === 'firefox' ? [
      'mousemove at 121;87',
      'mousedown at 121;87',
      'dragstart at 121;87',
      'mousemove at 241;351',
      'dragenter at 0;0',
      'dragover at 0;0',
      'dragend',
      'mouseup at 241;351',
    ] : [
      'mousemove at 121;87',
      'mousedown at 121;87',
      'mousemove at 241;351',
      'dragstart at 121;87',
      'dragenter at 241;351',
      browserName === 'chromium' ? null : 'dragover at 241;351',
      'dragend',
      'mouseup at 241;351',
    ].filter(Boolean));
  });

  it.describe('iframe', () => {
    it.fixme(true, 'implement dragging with iframes');

    it('should drag into an iframe', async ({ server, page, browserName }) => {
      await page.goto(server.PREFIX + '/drag-n-drop.html');
      const frame = await attachFrame(page, 'oopif', server.PREFIX + '/drag-n-drop.html');
      await page.$eval('iframe', iframe => {
        iframe.style.width = '500px';
        iframe.style.height = '600px';
        iframe.style.marginLeft = '500px';
        iframe.style.marginTop = '60px';
      });
      await page.waitForTimeout(5000);
      const pageEvents = await trackEvents(await page.$('body'));
      const frameEvents = await trackEvents(await frame.$('body'));
      await page.hover('#source');
      await page.mouse.down();
      await frame.hover('#target');
      await page.mouse.up();
      expect(await frame.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(true); // could not find source in target
      expect(await pageEvents.jsonValue()).toEqual([
        'mousemove',
        'mousedown',
        browserName === 'firefox' ? 'dragstart' : 'mousemove',
        browserName === 'firefox' ? 'mousemove' : 'dragstart',
      ]);
      expect(await frameEvents.jsonValue()).toEqual([
        'dragenter',
        'dragover',
        'drop',
      ]);
    });

    it('should drag out of an iframe', async ({ server, page }) => {
      await page.goto(server.PREFIX + '/drag-n-drop.html');
      const frame = await attachFrame(page, 'oopif', server.PREFIX + '/drag-n-drop.html');
      const pageEvents = await trackEvents(await page.$('body'));
      const frameEvents = await trackEvents(await frame.$('body'));
      await frame.hover('#source');
      await page.mouse.down();
      await page.hover('#target');
      await page.mouse.up();
      expect(await page.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(true); // could not find source in target
      expect(await frameEvents.jsonValue()).toEqual([
        'mousemove',
        'mousedown',
        'dragstart',
        'dragend',
      ]);
      expect(await pageEvents.jsonValue()).toEqual([
        'dragenter',
        'dragover',
        'drop',
      ]);
    });
  });

  it('should respect the drop effect', async ({ page, browserName, platform, trace }) => {
    it.fixme(browserName === 'webkit' && platform !== 'linux', 'WebKit doesn\'t handle the drop effect correctly outside of linux.');
    it.fixme(browserName === 'firefox');
    it.slow(trace === 'on');

    expect(await testIfDropped('copy', 'copy')).toBe(true);
    expect(await testIfDropped('copy', 'move')).toBe(false);
    expect(await testIfDropped('all', 'link')).toBe(true);
    expect(await testIfDropped('all', 'none')).toBe(false);

    expect(await testIfDropped('copyMove', 'copy')).toBe(true);
    expect(await testIfDropped('copyLink', 'copy')).toBe(true);
    expect(await testIfDropped('linkMove', 'copy')).toBe(false);

    expect(await testIfDropped('copyMove', 'link')).toBe(false);
    expect(await testIfDropped('copyLink', 'link')).toBe(true);
    expect(await testIfDropped('linkMove', 'link')).toBe(true);

    expect(await testIfDropped('copyMove', 'move')).toBe(true);
    expect(await testIfDropped('copyLink', 'move')).toBe(false);
    expect(await testIfDropped('linkMove', 'move')).toBe(true);

    expect(await testIfDropped('uninitialized', 'copy')).toBe(true);

    async function testIfDropped(effectAllowed: string, dropEffect: string) {
      await page.setContent(`
        <div draggable="true">drag target</div>
        <drop-target>this is the drop target</drop-target>
      `);
      await page.evaluate(({ effectAllowed, dropEffect }) => {
        window['dropped'] = false;

        document.querySelector('div').addEventListener('dragstart', event => {
          event.dataTransfer.effectAllowed = effectAllowed as any;
          event.dataTransfer.setData('text/plain', 'drag data');
        });

        const dropTarget: HTMLElement = document.querySelector('drop-target');
        dropTarget.addEventListener('dragover', event => {
          event.dataTransfer.dropEffect = dropEffect as any;
          event.preventDefault();
        });
        dropTarget.addEventListener('drop', event => {
          window['dropped'] = true;
        });
      }, { effectAllowed, dropEffect });
      await page.hover('div');
      await page.mouse.down();
      await page.hover('drop-target');
      await page.mouse.up();
      return await page.evaluate('dropped');
    }
  });
  it('should work if the drag is canceled', async ({ page, server }) => {
    await page.goto(server.PREFIX + '/drag-n-drop.html');
    await page.evaluate(() => {
      document.body.addEventListener('dragstart', event => {
        event.preventDefault();
      }, false);
    });
    await page.hover('#source');
    await page.mouse.down();
    await page.hover('#target');
    await page.mouse.up();
    expect(await page.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(false);
  });

  it('should work if the drag event is captured but not canceled', async ({ page, server }) => {
    await page.goto(server.PREFIX + '/drag-n-drop.html');
    await page.evaluate(() => {
      document.body.addEventListener('dragstart', event => {
        event.stopImmediatePropagation();
      }, false);
    });
    await page.hover('#source');
    await page.mouse.down();
    await page.hover('#target');
    await page.mouse.up();
    expect(await page.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(true);
  });

  it('should be able to drag the mouse in a frame', async ({ page, server, isAndroid }) => {
    it.fixme(isAndroid);

    await page.goto(server.PREFIX + '/frames/one-frame.html');
    const eventsHandle = await trackEvents(await page.frames()[1].$('html'));
    await page.mouse.move(30, 30);
    await page.mouse.down();
    await page.mouse.move(60, 60);
    await page.mouse.up();
    expect(await eventsHandle.jsonValue()).toEqual(['mousemove at 20;20', 'mousedown at 20;20', 'mousemove at 50;50', 'mouseup at 50;50']);
  });

  it('should work if a frame is stalled', async ({ page, server, toImpl }) => {
    await page.goto(server.PREFIX + '/drag-n-drop.html');
    let madeRequest;
    const routePromise = new Promise<Route>(x => madeRequest = x);
    await page.route('**/empty.html', async (route, request) => {
      madeRequest(route);
    });
    attachFrame(page, 'frame', server.EMPTY_PAGE).catch(() => {});
    const route = await routePromise;
    await page.hover('#source');
    await page.mouse.down();
    await page.hover('#target');
    await page.mouse.up();
    route.abort();
    expect(await page.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(true); // could not find source in target
  });

  it('should work with the helper method', async ({ page, server }) => {
    await page.goto(server.PREFIX + '/drag-n-drop.html');
    await page.dragAndDrop('#source', '#target');
    expect(await page.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(true); // could not find source in target
  });

  it('should allow specifying the position', async ({ page, server }) => {
    await page.setContent(`
      <div style="width:100px;height:100px;background:red;" id="red">
      </div>
      <div style="width:100px;height:100px;background:blue;" id="blue">
      </div>
    `);
    const eventsHandle = await page.evaluateHandle(() => {
      const events = [];
      document.getElementById('red').addEventListener('mousedown', event => {
        events.push({
          type: 'mousedown',
          x: event.offsetX,
          y: event.offsetY,
        });
      });
      document.getElementById('blue').addEventListener('mouseup', event => {
        events.push({
          type: 'mouseup',
          x: event.offsetX,
          y: event.offsetY,
        });
      });
      return events;
    });
    await page.dragAndDrop('#red', '#blue', {
      sourcePosition: { x: 34, y: 7 },
      targetPosition: { x: 10, y: 20 },
    });
    expect(await eventsHandle.jsonValue()).toEqual([
      { type: 'mousedown', x: 34, y: 7 },
      { type: 'mouseup', x: 10, y: 20 },
    ]);
  });

  it('should work with locators', async ({ page, server }) => {
    await page.goto(server.PREFIX + '/drag-n-drop.html');
    await page.locator('#source').dragTo(page.locator('#target'));
    expect(await page.$eval('#target', target => target.contains(document.querySelector('#source')))).toBe(true); // could not find source in target
  });
});

it('should work if not doing a drag', async ({ page }) => {
  const eventsHandle = await trackEvents(await page.$('html'));
  await page.mouse.move(50, 50);
  await page.mouse.down();
  await page.mouse.move(100, 100);
  await page.mouse.up();
  expect(await eventsHandle.jsonValue()).toEqual(['mousemove at 50;50', 'mousedown at 50;50', 'mousemove at 100;100', 'mouseup at 100;100']);
});

it('should report event.buttons', async ({ page, browserName }) => {
  const logsHandle = await page.evaluateHandle(async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    div.style.width = '200px';
    div.style.height = '200px';
    div.style.backgroundColor = 'blue';
    div.addEventListener('mousedown', onEvent);
    div.addEventListener('mousemove', onEvent, { passive: false });
    div.addEventListener('mouseup', onEvent);
    const logs = [];
    function onEvent(event) {
      logs.push({ type: event.type, buttons: event.buttons });
    }
    await new Promise(requestAnimationFrame);
    return logs;
  });
  await page.mouse.move(20, 20);
  await page.mouse.down();
  await page.mouse.move(40, 40);
  await page.mouse.up();
  const logs = await logsHandle.jsonValue();
  expect(logs).toEqual([
    { type: 'mousemove', buttons: 0 },
    { type: 'mousedown', buttons: 1 },
    { type: 'mousemove', buttons: 1 },
    { type: 'mouseup', buttons: 0 },
  ]);
});

async function trackEvents(target: ElementHandle) {
  const eventsHandle = await target.evaluateHandle(target => {
    const events: string[] = [];
    for (const event of [
      'mousedown', 'mousemove', 'mouseup',
      'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'dragexit',
      'drop'
    ]) {
      target.addEventListener(event, (e: PointerEvent) => {
        // Browsers are all over the place with dragend position.
        if (event === 'dragend')
          events.push('dragend');
        else
          events.push(`${event} at ${e.clientX};${e.clientY}`);
      }, false);
    }
    return events;
  });
  return eventsHandle;
}
