/**
 * Copyright Microsoft Corporation. All rights reserved.
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

import type { TestError } from '../reporter';
import type { SerializedConfig } from './ipc';
import { ProcessHost } from './processHost';
import { Suite } from './test';

export class LoaderHost extends ProcessHost<SerializedConfig> {
  constructor() {
    super(require.resolve('./loaderRunner.js'), 'loader');
  }

  async start(config: SerializedConfig) {
    await this.startRunner(config, true, {});
  }

  async loadTestFiles(files: string[], loadErrors: TestError[]): Promise<Suite> {
    const result = await this.sendMessage({ method: 'loadTestFiles', params: { files } }) as any;
    loadErrors.push(...result.loadErrors);
    return Suite._deepParse(result.rootSuite);
  }
}
