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

import type { Expect } from '../types';
import { currentTestInfo } from '../globals';
import { compare } from './golden';
import { addSuffixToFilePath, sanitizeForFilePath, trimLongString } from '../util';

// from expect/build/types
type SyncExpectationResult = {
  pass: boolean;
  message: () => string;
};

type NameOrSegments = string | string[];
const SNAPSHOT_COUNTER = Symbol('noname-snapshot-counter');
export function toMatchSnapshot(this: ReturnType<Expect['getState']>, received: Buffer | string, nameOrOptions: NameOrSegments | { name: NameOrSegments, threshold?: number }, optOptions: { threshold?: number, pixelCount?: number, pixelRatio?: number } = {}): SyncExpectationResult {
  let options: { name: NameOrSegments, threshold?: number, pixelCount?: number, pixelRatio?: number };
  const testInfo = currentTestInfo();
  if (!testInfo)
    throw new Error(`toMatchSnapshot() must be called during the test`);
  if (Array.isArray(nameOrOptions) || typeof nameOrOptions === 'string')
    options = { name: nameOrOptions, ...optOptions };
  else
    options = { ...nameOrOptions };
  if (!options.name) {
    (testInfo as any)[SNAPSHOT_COUNTER] = ((testInfo as any)[SNAPSHOT_COUNTER] || 0) + 1;
    const fullTitleWithoutSpec = [
      ...testInfo.titlePath.slice(1),
      (testInfo as any)[SNAPSHOT_COUNTER],
    ].join(' ');
    options.name = sanitizeForFilePath(trimLongString(fullTitleWithoutSpec)) + determineFileExtension(received);
  }

  options = {
    ...(testInfo.project.expect?.toMatchSnapshot || {}),
    ...options,
  };

  if (options.pixelCount !== undefined && options.pixelCount < 0)
    throw new Error('`pixelCount` option value must be non-negative integer');

  if (options.pixelRatio !== undefined && (options.pixelRatio < 0 || options.pixelRatio > 1))
    throw new Error('`pixelRatio` option value must be between 0 and 1');

  // sanitizes path if string
  const pathSegments = Array.isArray(options.name) ? options.name : [addSuffixToFilePath(options.name, '', undefined, true)];
  const withNegateComparison = this.isNot;
  let updateSnapshots = testInfo.config.updateSnapshots;
  if (updateSnapshots === 'missing' && testInfo.retry < testInfo.project.retries)
    updateSnapshots = 'none';
  const { pass, message, expectedPath, actualPath, diffPath, mimeType } = compare(
      received,
      pathSegments,
      testInfo,
      updateSnapshots,
      withNegateComparison,
      options
  );
  const contentType = mimeType || 'application/octet-stream';
  if (expectedPath)
    testInfo.attachments.push({ name: 'expected', contentType, path: expectedPath });
  if (actualPath)
    testInfo.attachments.push({ name: 'actual', contentType, path: actualPath });
  if (diffPath)
    testInfo.attachments.push({ name: 'diff', contentType, path: diffPath });
  return { pass, message: () => message || '' };
}


function determineFileExtension(file: string | Buffer): string {
  if (typeof file === 'string')
    return '.txt';
  if (compareMagicBytes(file, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return '.png';
  if (compareMagicBytes(file, [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01]))
    return '.jpg';
  return '.bin';
}

function compareMagicBytes(file: Buffer, magicBytes: number[]): boolean {
  return Buffer.compare(Buffer.from(magicBytes), file.slice(0, magicBytes.length)) === 0;
}
