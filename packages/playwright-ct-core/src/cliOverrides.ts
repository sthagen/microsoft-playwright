
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

import { removeFolder } from 'playwright/lib/program';
import { affectedTestFiles, cacheDir } from 'playwright/lib/transform/compilationCache';
import { buildBundle } from './vitePlugin';
import { resolveDirs } from './viteUtils';
import type { Suite } from 'playwright/lib/common/test';
import type { FullConfig } from 'playwright/test';

export async function clearCacheCommand(config: FullConfig, configDir: string) {
  const dirs = await resolveDirs(configDir, config);
  if (dirs)
    await removeFolder(dirs.outDir);
  await removeFolder(cacheDir);
}

export async function findRelatedTestFilesCommand(files: string[],  config: FullConfig, configDir: string, suite: Suite) {
  await buildBundle(config, configDir, suite);
  return { testFiles: affectedTestFiles(files) };
}
