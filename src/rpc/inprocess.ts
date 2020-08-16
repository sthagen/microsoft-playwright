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

import { DispatcherConnection } from './server/dispatcher';
import type { Playwright as PlaywrightImpl } from '../server/playwright';
import type { Playwright as PlaywrightAPI } from './client/playwright';
import { PlaywrightDispatcher } from './server/playwrightDispatcher';
import { Connection } from './client/connection';
import { isUnderTest } from '../helper';
import { BrowserServerLauncherImpl } from './browserServerImpl';

export function setupInProcess(playwright: PlaywrightImpl): PlaywrightAPI {
  const clientConnection = new Connection();
  const dispatcherConnection = new DispatcherConnection();

  // Dispatch synchronously at first.
  dispatcherConnection.onmessage = message => clientConnection.dispatch(message);
  clientConnection.onmessage = message => dispatcherConnection.dispatch(message);

  // Initialize Playwright channel.
  new PlaywrightDispatcher(dispatcherConnection.rootDispatcher(), playwright);
  const playwrightAPI = clientConnection.getObjectWithKnownName('Playwright') as PlaywrightAPI;
  playwrightAPI.chromium._serverLauncher = new BrowserServerLauncherImpl(playwright.chromium);
  playwrightAPI.firefox._serverLauncher = new BrowserServerLauncherImpl(playwright.firefox);
  playwrightAPI.webkit._serverLauncher = new BrowserServerLauncherImpl(playwright.webkit);

  // Switch to async dispatch after we got Playwright object.
  dispatcherConnection.onmessage = message => setImmediate(() => clientConnection.dispatch(message));
  clientConnection.onmessage = message => setImmediate(() => dispatcherConnection.dispatch(message));

  if (isUnderTest())
    (playwrightAPI as any)._toImpl = (x: any) => dispatcherConnection._dispatchers.get(x._guid)!._object;
  return playwrightAPI;
}
