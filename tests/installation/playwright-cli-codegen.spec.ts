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
import { test, expect } from './npmTest';

test('codegen should work', async ({ exec }) => {
  await exec('npm i --foreground-scripts playwright');

  await test.step('codegen without arguments', async () => {
    const result = await exec('npx playwright codegen', {
      env: {
        PWTEST_CLI_IS_UNDER_TEST: '1',
        PWTEST_CLI_AUTO_EXIT_WHEN: '@playwright/test',
      }
    });
    expect(result).toContain(`{ page }`);
  });

  await test.step('codegen --target=javascript', async () => {
    const result = await exec('npx playwright codegen --target=javascript', {
      env: {
        PWTEST_CLI_IS_UNDER_TEST: '1',
        PWTEST_CLI_AUTO_EXIT_WHEN: 'context.close',
      }
    });
    expect(result).toContain(`playwright`);
  });

  await test.step('codegen --target=python', async () => {
    const result = await exec('npx playwright codegen --target=python', {
      env: {
        PWTEST_CLI_IS_UNDER_TEST: '1',
        PWTEST_CLI_AUTO_EXIT_WHEN: 'chromium.launch',
      },
    });
    expect(result).toContain(`browser.close`);
  });
});
