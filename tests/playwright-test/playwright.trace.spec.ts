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

import { test, expect } from './playwright-test-fixtures';
import { parseTrace } from '../config/utils';
import fs from 'fs';

test.describe.configure({ mode: 'parallel' });

test('should stop tracing with trace: on-first-retry, when not retrying', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = { use: { trace: 'on-first-retry' } };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';

      test.describe('shared', () => {
        let page;
        test.beforeAll(async ({ browser }) => {
          page = await browser.newPage();
        });

        test.afterAll(async () => {
          await page.close();
        });

        test('flaky', async ({}, testInfo) => {
          expect(testInfo.retry).toBe(1);
        });

        test('no tracing', async ({}, testInfo) => {
          const e = await page.context().tracing.stop({ path: 'ignored' }).catch(e => e);
          expect(e.message).toContain('Must start tracing before stopping');
        });
      });
    `,
  }, { workers: 1, retries: 1 });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(result.flaky).toBe(1);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'a-shared-flaky-retry1', 'trace.zip'))).toBeTruthy();
});

test('should record api trace', async ({ runInlineTest, server }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = { use: { trace: 'on' } };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';

      test('pass', async ({request, page}, testInfo) => {
        await page.goto('about:blank');
        await request.get('${server.EMPTY_PAGE}');
      });

      test('api pass', async ({playwright}, testInfo) => {
        const request = await playwright.request.newContext();
        await request.get('${server.EMPTY_PAGE}');
      });

      test('fail', async ({request, page}, testInfo) => {
        await page.goto('about:blank');
        await request.get('${server.EMPTY_PAGE}');
        expect(1).toBe(2);
      });
    `,
  }, { workers: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(2);
  expect(result.failed).toBe(1);
  // One trace file for request context and one for each APIRequestContext
  const trace1 = await parseTrace(testInfo.outputPath('test-results', 'a-pass', 'trace.zip'));
  expect(trace1.actions).toEqual(['browserContext.newPage', 'page.goto', 'apiRequestContext.get']);
  const trace2 = await parseTrace(testInfo.outputPath('test-results', 'a-api-pass', 'trace.zip'));
  expect(trace2.actions).toEqual(['apiRequestContext.get']);
  const trace3 = await parseTrace(testInfo.outputPath('test-results', 'a-fail', 'trace.zip'));
  expect(trace3.actions).toEqual(['browserContext.newPage', 'page.goto', 'apiRequestContext.get', 'expect.toBe']);
});


test('should not throw with trace: on-first-retry and two retries in the same worker', async ({ runInlineTest }, testInfo) => {
  const files = {};
  for (let i = 0; i < 6; i++) {
    files[`a${i}.spec.ts`] = `
      import { test, expect } from './helper';
      test('flaky', async ({ myContext }, testInfo) => {
        await new Promise(f => setTimeout(f, 200 + Math.round(Math.random() * 1000)));
        expect(testInfo.retry).toBe(1);
      });
      test('passing', async ({ myContext }, testInfo) => {
        await new Promise(f => setTimeout(f, 200 + Math.round(Math.random() * 1000)));
      });
    `;
  }
  const result = await runInlineTest({
    ...files,
    'playwright.config.ts': `
      module.exports = { use: { trace: 'on-first-retry' } };
    `,
    'helper.ts': `
      import { test as base } from '@playwright/test';
      export * from '@playwright/test';
      export const test = base.extend({
        myContext: [async ({ browser }, use) => {
          const c = await browser.newContext();
          await use(c);
          await c.close();
        }, { scope: 'worker' }]
      })
    `,
  }, { workers: 3, retries: 1 });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(6);
  expect(result.flaky).toBe(6);
});

test('should not mixup network files between contexts', async ({ runInlineTest, server }, testInfo) => {
  // NOTE: this test reproduces the issue 10% of the time. Running with --repeat-each=20 helps.
  test.info().annotations.push({ type: 'issue', description: 'https://github.com/microsoft/playwright/issues/22089' });

  const result = await runInlineTest({
    'playwright.config.ts': `
      export default { use: { trace: 'on' } };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';

      let page1, page2;

      test.beforeAll(async ({ browser }) => {
        page1 = await browser.newPage();
        await page1.goto("${server.EMPTY_PAGE}");

        page2 = await browser.newPage();
        await page2.goto("${server.EMPTY_PAGE}");
      });

      test.afterAll(async () => {
        await page1.close();
        await page2.close();
      });

      test('example', async ({ page }) => {
        await page.goto("${server.EMPTY_PAGE}");
      });
    `,
  }, { workers: 1, timeout: 15000 });
  expect(result.exitCode).toEqual(0);
  expect(result.passed).toBe(1);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'a-example', 'trace.zip'))).toBe(true);
});

test('should save sources when requested', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = {
        use: {
          trace: 'on',
        }
      };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('pass', async ({ page }) => {
        await page.evaluate(2 + 2);
      });
    `,
  }, { workers: 1 });
  expect(result.exitCode).toEqual(0);
  const { resources } = await parseTrace(testInfo.outputPath('test-results', 'a-pass', 'trace.zip'));
  expect([...resources.keys()].filter(name => name.startsWith('resources/src@'))).toHaveLength(1);
});

test('should not save sources when not requested', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = {
        use: {
          trace: {
            mode: 'on',
            sources: false,
          }
        }
      };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('pass', async ({ page }) => {
        await page.evaluate(2 + 2);
      });
    `,
  }, { workers: 1 });
  expect(result.exitCode).toEqual(0);
  const { resources } = await parseTrace(testInfo.outputPath('test-results', 'a-pass', 'trace.zip'));
  expect([...resources.keys()].filter(name => name.startsWith('resources/src@'))).toHaveLength(0);
});

test('should work in serial mode', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = { use: { trace: 'retain-on-failure' } };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';

      test.describe.serial('serial', () => {
        let page;
        test.beforeAll(async ({ browser }) => {
          page = await browser.newPage();
        });

        test.afterAll(async () => {
          await page.close();
        });

        test('passes', async ({}, testInfo) => {
        });

        test('fails', async ({}, testInfo) => {
          throw new Error('oh my');
        });
      });
    `,
  }, { workers: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(1);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'a-serial-passes', 'trace.zip'))).toBeFalsy();
  expect(fs.existsSync(testInfo.outputPath('test-results', 'a-serial-fails', 'trace.zip'))).toBeTruthy();
});

test('should not override trace file in afterAll', async ({ runInlineTest, server }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = { use: { trace: 'retain-on-failure' } };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';

      test('test 1', async ({ page }) => {
        await page.goto('about:blank');
        throw 'oh no!';
      });

      // Another test in the same file to affect after hooks order.
      test('test 2', async ({ page }) => {
      });

      test.afterAll(async ({ request }) => {
        await request.get('${server.EMPTY_PAGE}');
      });
    `,
  }, { workers: 1 });

  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(1);
  const trace1 = await parseTrace(testInfo.outputPath('test-results', 'a-test-1', 'trace.zip'));
  expect(trace1.actions).toEqual(['browserContext.newPage', 'page.goto', 'apiRequestContext.get']);
  const error = await parseTrace(testInfo.outputPath('test-results', 'a-test-2', 'trace.zip')).catch(e => e);
  expect(error).toBeTruthy();
});

test('should retain traces for interrupted tests', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = { use: { trace: 'retain-on-failure' }, maxFailures: 1 };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('test 1', async ({ page }) => {
        await page.waitForTimeout(2000);
        expect(1).toBe(2);
      });
    `,
    'b.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('test 2', async ({ page }) => {
        await page.goto('about:blank');
        await page.waitForTimeout(5000);
      });
    `,
  }, { workers: 2 });

  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.interrupted).toBe(1);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'a-test-1', 'trace.zip'))).toBeTruthy();
  expect(fs.existsSync(testInfo.outputPath('test-results', 'b-test-2', 'trace.zip'))).toBeTruthy();
});

test('should respect --trace', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('test 1', async ({ page }) => {
        await page.goto('about:blank');
      });
    `,
  }, { trace: 'on' });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'a-test-1', 'trace.zip'))).toBeTruthy();
});

test('should respect PW_TEST_DISABLE_TRACING', async ({ runInlineTest }, testInfo) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      export default { use: { trace: 'on' } };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('test 1', async ({ page }) => {
        await page.goto('about:blank');
      });
    `,
  }, {}, { PW_TEST_DISABLE_TRACING: '1' });

  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
  expect(fs.existsSync(testInfo.outputPath('test-results', 'a-test-1', 'trace.zip'))).toBe(false);
});

for (const mode of ['off', 'retain-on-failure', 'on-first-retry', 'on-all-retries']) {
  test(`trace:${mode} should not create trace zip artifact if page test passed`, async ({ runInlineTest }) => {
    const result = await runInlineTest({
      'a.spec.ts': `
        import { test as base, expect } from '@playwright/test';
        import fs from 'fs';
        const test = base.extend<{
          locale: string | undefined,
          _artifactsDir: () => string,
        }>({
          // Override locale fixture to check in teardown that no temporary trace zip was created.
          locale: [async ({ locale, _artifactsDir }, use) => {
            await use(locale);
            const entries =  fs.readdirSync(_artifactsDir());
            expect(entries.filter(e => e.endsWith('.zip'))).toEqual([]);
          }, { option: true }],
        });
        test('passing test', async ({ page }) => {
          await page.goto('about:blank');
        });
      `,
    }, { trace: 'retain-on-failure' });
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
  });

  test(`trace:${mode} should not create trace zip artifact if APIRequestContext test passed`, async ({ runInlineTest, server }) => {
    const result = await runInlineTest({
      'a.spec.ts': `
        import { test as base, expect } from '@playwright/test';
        import fs from 'fs';
        const test = base.extend<{
          locale: string | undefined,
          _artifactsDir: () => string,
        }>({
          // Override locale fixture to check in teardown that no temporary trace zip was created.
          locale: [async ({ locale, _artifactsDir }, use) => {
            await use(locale);
            const entries =  fs.readdirSync(_artifactsDir());
            expect(entries.filter(e => e.endsWith('.zip'))).toEqual([]);
          }, { option: true }],
        });
        test('passing test', async ({ request }) => {
          expect(await request.get('${server.EMPTY_PAGE}')).toBeOK();
        });
      `,
    }, { trace: 'retain-on-failure' });
    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);
  });
}

test(`trace:retain-on-failure should create trace if context is closed before failure in the test`, async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = { use: { trace: 'retain-on-failure' } };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('passing test', async ({ page, context }) => {
        await page.goto('about:blank');
        await context.close();
        expect(1).toBe(2);
      });
    `,
  }, { trace: 'retain-on-failure' });
  const tracePath = test.info().outputPath('test-results', 'a-passing-test', 'trace.zip');
  const trace = await parseTrace(tracePath);
  expect(trace.actions).toContain('page.goto');
  expect(result.failed).toBe(1);
});

test(`trace:retain-on-failure should create trace if context is closed before failure in afterEach`, async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = { use: { trace: 'retain-on-failure' } };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('passing test', async ({ page, context }) => {
      });
      test.afterEach(async ({ page, context }) => {
        await page.goto('about:blank');
        await context.close();
        expect(1).toBe(2);
      });
    `,
  }, { trace: 'retain-on-failure' });
  const tracePath = test.info().outputPath('test-results', 'a-passing-test', 'trace.zip');
  const trace = await parseTrace(tracePath);
  expect(trace.actions).toContain('page.goto');
  expect(result.failed).toBe(1);
});

test(`trace:retain-on-failure should create trace if request context is disposed before failure`, async ({ runInlineTest, server }) => {
  const result = await runInlineTest({
    'playwright.config.ts': `
      module.exports = { use: { trace: 'retain-on-failure' } };
    `,
    'a.spec.ts': `
      import { test, expect } from '@playwright/test';
      test('passing test', async ({ request }) => {
        expect(await request.get('${server.EMPTY_PAGE}')).toBeOK();
        await request.dispose();
        expect(1).toBe(2);
      });
    `,
  }, { trace: 'retain-on-failure' });
  const tracePath = test.info().outputPath('test-results', 'a-passing-test', 'trace.zip');
  const trace = await parseTrace(tracePath);
  expect(trace.actions).toContain('apiRequestContext.get');
  expect(result.failed).toBe(1);
});
