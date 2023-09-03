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

test('global installation', async ({ exec, installedSoftwareOnDisk }) => {
  const result1 = await exec('npm i --foreground-scripts playwright');
  expect(result1).toHaveLoggedSoftwareDownload([]);
  expect(await installedSoftwareOnDisk()).toEqual([]);

  const result2 = await exec('npx playwright install');
  expect(result2).toHaveLoggedSoftwareDownload(['chromium', 'ffmpeg', 'firefox', 'webkit']);
  expect(await installedSoftwareOnDisk()).toEqual(['chromium', 'ffmpeg', 'firefox', 'webkit']);

  await exec('node sanity.js playwright', { env: { PLAYWRIGHT_BROWSERS_PATH: undefined } });
  await exec('node sanity.js playwright chromium firefox webkit');
});
