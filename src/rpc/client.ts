/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License");
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

import * as childProcess from 'child_process';
import * as path from 'path';
import { Connection } from './connection';
import { Transport } from './transport';

(async () => {
  const spawnedProcess = childProcess.fork(path.join(__dirname, 'server'), [], { stdio: 'pipe' });
  const transport = new Transport(spawnedProcess.stdin, spawnedProcess.stdout);
  const connection = new Connection();
  connection.onmessage = message => transport.send(message);
  transport.onmessage = message => connection.send(message);

  const chromium = await connection.waitForObjectWithKnownName('chromium');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://example.com');
})();
