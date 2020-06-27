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

const { Writable } = require('stream');
const {FFOX, CHROMIUM, WEBKIT} = require('./utils').testOptions(browserType);

const pattern = [
  '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
  '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
].join('|')
class WritableBuffer {
  constructor() {
    this.lines = [];
  }

  write(chunk) {
    if (chunk === '\u001B[F\u001B[2K') {
      this.lines.pop();
      return;
    }
    this.lines.push(...chunk.split('\n'));
    if (this._callback && chunk.includes(this._text))
      this._callback();
  }

  waitFor(text) {
    if (this.lines.join('\n').includes(text))
      return Promise.resolve();
    this._text = text;
    return new Promise(f => this._callback = f);
  }

  data() {
    return this.lines.join('\n');
  }

  text() {
    const pattern = [
      '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
      '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
    ].join('|');
    return this.data().replace(new RegExp(pattern, 'g'), '');
  }
}

describe('Recorder', function() {
  beforeEach(async state => {
    state.context = await state.browser.newContext();
    state.output = new WritableBuffer();
    const debugController = state.context._initDebugModeForTest({ recorderOutput: state.output });
  });
 
  afterEach(async state => {
    await state.context.close();
  });
 
  it('should click', async function({context, output, server}) {
    const page = await context.newPage();
    await page.goto(server.EMPTY_PAGE);
    await page.setContent(`<button onclick="console.log('click')">Submit</button>`);
    const [message] = await Promise.all([
      page.waitForEvent('console'),
      output.waitFor('click'),
      page.dispatchEvent('button', 'click', { detail: 1 })
    ]);
    expect(output.text()).toContain(`
  // Click text="Submit"
  await page.click('text="Submit"');`);
    expect(message.text()).toBe('click');
  });

  it('should fill', async function({context, output, server}) {
    const page = await context.newPage();
    await page.goto(server.EMPTY_PAGE);
    await page.setContent(`<input id="input" name="name" oninput="console.log(input.value)"></input>`);
    const [message] = await Promise.all([
      page.waitForEvent('console'),
      output.waitFor('fill'),
      page.fill('input', 'John')
    ]);
    expect(output.text()).toContain(`
  // Fill input[name=name]
  await page.fill('input[name=name]', 'John');`);
    expect(message.text()).toBe('John');
  });

  it('should press', async function({context, output, server}) {
    const page = await context.newPage();
    await page.goto(server.EMPTY_PAGE);
    await page.setContent(`<input name="name" onkeypress="console.log('press')"></input>`);
    const [message] = await Promise.all([
      page.waitForEvent('console'),
      output.waitFor('press'),
      page.press('input', 'Shift+Enter')
    ]);
    expect(output.text()).toContain(`
  // Press Enter with modifiers
  await page.press('input[name=name]', 'Shift+Enter');`);
    expect(message.text()).toBe('press');
  });

  it('should check', async function({context, output, server}) {
    const page = await context.newPage();
    await page.goto(server.EMPTY_PAGE);
    await page.setContent(`<input id="checkbox" type="checkbox" name="accept" onchange="console.log(checkbox.checked)"></input>`);
    const [message] = await Promise.all([
      page.waitForEvent('console'),
      output.waitFor('check'),
      page.dispatchEvent('input', 'click', { detail: 1 })
    ]);
    await output.waitFor('check');
    expect(output.text()).toContain(`
  // Check input[name=accept]
  await page.check('input[name=accept]');`);
    expect(message.text()).toBe("true");
  });

  it('should uncheck', async function({context, output, server}) {
    const page = await context.newPage();
    await page.goto(server.EMPTY_PAGE);
    await page.setContent(`<input id="checkbox" type="checkbox" checked name="accept" onchange="console.log(checkbox.checked)"></input>`);
    const [message] = await Promise.all([
      page.waitForEvent('console'),
      output.waitFor('uncheck'),
      page.dispatchEvent('input', 'click', { detail: 1 })
    ]);
    expect(output.text()).toContain(`
  // Uncheck input[name=accept]
  await page.uncheck('input[name=accept]');`);
    expect(message.text()).toBe("false");
  });

  it('should select', async function({context, output, server}) {
    const page = await context.newPage();
    await page.goto(server.EMPTY_PAGE);
    await page.setContent('<select id="age" onchange="console.log(age.selectedOptions[0].value)"><option value="1"><option value="2"></select>');
    const [message] = await Promise.all([
      page.waitForEvent('console'),
      output.waitFor('select'),
      page.selectOption('select', '2')
    ]);
    expect(output.text()).toContain(`
  // Select select[id=age]
  await page.selectOption('select[id=age]', '2');`);
    expect(message.text()).toBe("2");
  });

  it('should await popup', async function({context, output, server}) {
    const page = await context.newPage();
    await page.goto(server.EMPTY_PAGE);
    await page.setContent('<a target=_blank rel=noopener href="/popup/popup.html">link</a>');
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      output.waitFor('waitForEvent'),
      page.dispatchEvent('a', 'click', { detail: 1 })
    ]);
    expect(output.text()).toContain(`
  // Click text="link"
  const [popup1] = await Promise.all([
    page.waitForEvent('popup'),
    await page.click('text="link"');
  ]);`);
    expect(popup.url()).toBe(`${server.PREFIX}/popup/popup.html`);
  });

  it('should await navigation', async function({context, output, server}) {
    const page = await context.newPage();
    await page.goto(server.EMPTY_PAGE);
    await page.setContent(`<a onclick="setTimeout(() => window.location.href='${server.PREFIX}/popup/popup.html', 1000)">link</a>`);
    await Promise.all([
      page.waitForNavigation(),
      output.waitFor('waitForNavigation'),
      page.dispatchEvent('a', 'click', { detail: 1 })
    ]);
    expect(output.text()).toContain(`
  // Click text="link"
  await Promise.all([
    page.waitForNavigation({ url: '${server.PREFIX}/popup/popup.html' }),
    page.click('text="link"')
  ]);`);
    expect(page.url()).toContain('/popup/popup.html');
  });
});
