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

import * as fs from 'fs';
import * as mime from 'mime';
import * as path from 'path';
import * as util from 'util';
import { TimeoutError } from '../errors';
import * as types from '../types';


export function serializeError(e: any): types.Error {
  if (e instanceof Error)
    return { message: e.message, stack: e.stack, name: e.name };
  return { value: e };
}

export function parseError(error: types.Error): any {
  if (error.message === undefined)
    return error.value;
  if (error.name === 'TimeoutError') {
    const e = new TimeoutError(error.message);
    e.stack = error.stack;
    return e;
  }
  const e = new Error(error.message);
  e.stack = error.stack;
  return e;
}

export async function normalizeFilePayloads(files: string | types.FilePayload | string[] | types.FilePayload[]): Promise<types.FilePayload[]> {
  let ff: string[] | types.FilePayload[];
  if (!Array.isArray(files))
    ff = [ files ] as string[] | types.FilePayload[];
  else
    ff = files;
  const filePayloads: types.FilePayload[] = [];
  for (const item of ff) {
    if (typeof item === 'string') {
      const file: types.FilePayload = {
        name: path.basename(item),
        mimeType: mime.getType(item) || 'application/octet-stream',
        buffer: await util.promisify(fs.readFile)(item)
      };
      filePayloads.push(file);
    } else {
      filePayloads.push(item);
    }
  }
  return filePayloads;
}
