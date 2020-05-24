/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
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

import { assert } from '../helper';
import { WKSession } from './wkConnection';
import { Protocol } from './protocol';
import * as js from '../javascript';

export function valueFromRemoteObject(ro: js.RemoteObject): any {
  const remoteObject = ro as Protocol.Runtime.RemoteObject;
  assert(!remoteObject.objectId, 'Cannot extract value when objectId is given');
  if (remoteObject.type === 'number') {
    if (remoteObject.value === null) {
      switch (remoteObject.description) {
        case 'NaN':
          return NaN;
        case 'Infinity':
          return Infinity;
        case '-Infinity':
          return -Infinity;
        default:
          throw new Error('Unsupported unserializable value: ' + remoteObject.description);
      }
    } else if (remoteObject.value === 0) {
      switch (remoteObject.description) {
        case '-0':
          return -0;
      }
    }
  }
  return remoteObject.value;
}

export async function releaseObject(client: WKSession, remoteObject: js.RemoteObject) {
  if (!remoteObject.objectId)
    return;
  await client.send('Runtime.releaseObject', {objectId: remoteObject.objectId}).catch(error => {});
}

