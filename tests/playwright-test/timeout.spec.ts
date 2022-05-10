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

import { test, expect, stripAnsi } from './playwright-test-fixtures';

test('should run fixture teardown on timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'helper.ts': `
      export const test = pwt.test.extend({
        foo: async ({}, run, testInfo) => {
          await run();
          console.log('STATUS:' + testInfo.status);
        }
      });
    `,
    'c.spec.ts': `
      import { test } from './helper';
      test('works', async ({ foo }) => {
        await new Promise(f => setTimeout(f, 100000));
      });
    `
  }, { timeout: 1000 });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('STATUS:timedOut');
});

test('should respect test.setTimeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const { test } = pwt;
      test('fails', async ({}) => {
        await new Promise(f => setTimeout(f, 1500));
      });
      test('passes', async ({}) => {
        await new Promise(f => setTimeout(f, 500));
        test.setTimeout(2000);
        await new Promise(f => setTimeout(f, 1000));
      });

      test.describe('suite', () => {
        test.beforeEach(() => {
          test.setTimeout(2000);
        });
        test('passes2', async ({}, testInfo) => {
          expect(testInfo.timeout).toBe(2000);
          await new Promise(f => setTimeout(f, 1500));
        });
      });
    `
  }, { timeout: 1000 });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.passed).toBe(2);
  expect(result.output).toContain('Timeout of 1000ms exceeded');
});

test('should respect test.setTimeout outside of the test', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const { test } = pwt;

      test.setTimeout(500);
      test('fails', async ({}) => {
        await new Promise(f => setTimeout(f, 1000));
      });
      test('passes', async ({}) => {
        await new Promise(f => setTimeout(f, 100));
      });

      test.describe('suite', () => {
        test.setTimeout(50);
        test('fails', async ({}) => {
          await new Promise(f => setTimeout(f, 100));
        });
        test('passes', async ({}) => {
        });
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(2);
  expect(result.passed).toBe(2);
  expect(result.output).toContain('Timeout of 500ms exceeded');
});

test('should timeout when calling test.setTimeout too late', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const { test } = pwt;
      test('fails', async ({}) => {
        await new Promise(f => setTimeout(f, 500));
        test.setTimeout(100);
        await new Promise(f => setTimeout(f, 1));
      });
    `
  }, { timeout: 1000 });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.passed).toBe(0);
  expect(result.output).toContain('Timeout of 100ms exceeded');
});

test('should respect test.slow', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const { test } = pwt;
      test('fails', async ({}) => {
        await new Promise(f => setTimeout(f, 1500));
      });
      test('passes', async ({}) => {
        test.slow();
        await new Promise(f => setTimeout(f, 1500));
      });

      test.describe('suite', () => {
        test.slow();
        test('passes2', async ({}, testInfo) => {
          expect(testInfo.timeout).toBe(3000);
          await new Promise(f => setTimeout(f, 1500));
        });
      });
    `
  }, { timeout: 1000 });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.passed).toBe(2);
  expect(result.output).toContain('Timeout of 1000ms exceeded');
});

test('should ignore test.setTimeout when debugging', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const test = pwt.test.extend({
        fixture: async ({}, use) => {
          test.setTimeout(100);
          await new Promise(f => setTimeout(f, 200));
          await use('hey');
        },
      });
      test('my test', async ({ fixture }) => {
        test.setTimeout(1000);
        await new Promise(f => setTimeout(f, 2000));
      });
    `
  }, { timeout: 0 });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('should respect fixture timeout', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const test = pwt.test.extend({
        fixture: [async ({}, use) => {
          await new Promise(f => setTimeout(f, 300));
          await use('hey');
          await new Promise(f => setTimeout(f, 300));
        }, { timeout: 1000 }],
        noTimeout: [async ({}, use) => {
          await new Promise(f => setTimeout(f, 300));
          await use('hey');
          await new Promise(f => setTimeout(f, 300));
        }, { timeout: 0 }],
        slowSetup: [async ({}, use) => {
          await new Promise(f => setTimeout(f, 2000));
          await use('hey');
        }, { timeout: 500, _title: 'custom title' }],
        slowTeardown: [async ({}, use) => {
          await use('hey');
          await new Promise(f => setTimeout(f, 2000));
        }, { timeout: 400 }],
      });
      test('test ok', async ({ fixture, noTimeout }) => {
        await new Promise(f => setTimeout(f, 1000));
      });
      test('test setup', async ({ slowSetup }) => {
      });
      test('test teardown', async ({ slowTeardown }) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(1);
  expect(result.failed).toBe(2);
  expect(result.output).toContain('Timeout of 500ms exceeded by fixture "custom title" setup.');
  expect(result.output).toContain('Timeout of 400ms exceeded by fixture "slowTeardown" teardown.');
  expect(stripAnsi(result.output)).toContain('> 5 |       const test = pwt.test.extend({');
});

test('should respect test.setTimeout in the worker fixture', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const test = pwt.test.extend({
        fixture: [async ({}, use) => {
          await new Promise(f => setTimeout(f, 300));
          await use('hey');
          await new Promise(f => setTimeout(f, 300));
        }, { scope: 'worker', timeout: 1000 }],
        noTimeout: [async ({}, use) => {
          await new Promise(f => setTimeout(f, 300));
          await use('hey');
          await new Promise(f => setTimeout(f, 300));
        }, { scope: 'worker', timeout: 0 }],
        slowSetup: [async ({}, use) => {
          await new Promise(f => setTimeout(f, 2000));
          await use('hey');
        }, { scope: 'worker', timeout: 500 }],
        slowTeardown: [async ({}, use) => {
          await use('hey');
          await new Promise(f => setTimeout(f, 2000));
        }, { scope: 'worker', timeout: 400, _title: 'custom title' }],
      });
      test('test ok', async ({ fixture, noTimeout }) => {
        await new Promise(f => setTimeout(f, 1000));
      });
      test('test setup', async ({ slowSetup }) => {
      });
      test('test teardown', async ({ slowTeardown }) => {
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.passed).toBe(2);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Timeout of 500ms exceeded by fixture "slowSetup" setup.');
  expect(result.output).toContain('Timeout of 400ms exceeded by fixture "custom title" teardown.');
});

test('fixture time in beforeAll hook should not affect test', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const test = pwt.test.extend({
        fixture: async ({}, use) => {
          await new Promise(f => setTimeout(f, 500));
          await use('hey');
        },
      });
      test.beforeAll(async ({ fixture }) => {
        // Nothing to see here.
      });
      test('test ok', async ({}) => {
        test.setTimeout(1000);
        await new Promise(f => setTimeout(f, 800));
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('fixture timeout in beforeAll hook should not affect test', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const test = pwt.test.extend({
        fixture: [async ({}, use) => {
          await new Promise(f => setTimeout(f, 500));
          await use('hey');
        }, { timeout: 800 }],
      });
      test.beforeAll(async ({ fixture }) => {
        // Nothing to see here.
      });
      test('test ok', async ({}) => {
        test.setTimeout(1000);
        await new Promise(f => setTimeout(f, 800));
      });
    `
  });
  expect(result.exitCode).toBe(0);
  expect(result.passed).toBe(1);
});

test('fixture time in beforeEach hook should affect test', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const test = pwt.test.extend({
        fixture: async ({}, use) => {
          await new Promise(f => setTimeout(f, 500));
          await use('hey');
        },
      });
      test.beforeEach(async ({ fixture }) => {
        // Nothing to see here.
      });
      test('test ok', async ({}) => {
        test.setTimeout(1000);
        await new Promise(f => setTimeout(f, 800));
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Timeout of 1000ms exceeded');
});

test('test timeout should still run hooks before fixtures teardown', async ({ runInlineTest }) => {
  const result = await runInlineTest({
    'a.spec.ts': `
      const test = pwt.test.extend({
        auto: [async ({}, use) => {
          console.log('\\n%%before-auto');
          await use('hey');
          console.log('\\n%%after-auto');
        }, { auto: true }]
      });
      test.afterAll(async () => {
        console.log('\\n%%afterAll-1');
        await new Promise(f => setTimeout(f, 500));
        console.log('\\n%%afterAll-2');
      });
      test('test fail', async ({}) => {
        test.setTimeout(100);
        console.log('\\n%%test');
        await new Promise(f => setTimeout(f, 800));
      });
    `
  });
  expect(result.exitCode).toBe(1);
  expect(result.failed).toBe(1);
  expect(result.output).toContain('Timeout of 100ms exceeded');
  expect(result.output.split('\n').filter(line => line.startsWith('%%'))).toEqual([
    '%%before-auto',
    '%%test',
    '%%afterAll-1',
    '%%afterAll-2',
    '%%after-auto',
  ]);
});
