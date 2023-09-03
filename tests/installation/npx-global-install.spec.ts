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

test('npx playwright install global', async ({ exec, installedSoftwareOnDisk }) => {
  test.skip(process.platform === 'win32', 'isLikelyNpxGlobal() does not work in this setup on our bots');

  const result = await exec('npx playwright install', { env: { npm_config_prefix: '' } }); // global npx and npm_config_prefix do not work together nicely (https://github.com/npm/cli/issues/5268)
  expect(result).toHaveLoggedSoftwareDownload(['chromium', 'ffmpeg', 'firefox', 'webkit']);
  expect(await installedSoftwareOnDisk()).toEqual(['chromium', 'ffmpeg', 'firefox', 'webkit']);
  expect(result).not.toContain(`Please run the following command to download new browsers`);
  expect(result).toContain(`To avoid unexpected behavior, please install your dependencies first`);
});
