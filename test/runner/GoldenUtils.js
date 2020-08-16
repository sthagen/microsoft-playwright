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
const path = require('path');
const fs = require('fs');
const Diff = require('text-diff');
const PNG = require('pngjs').PNG;
const jpeg = require('jpeg-js');
const pixelmatch = require('pixelmatch');
const c = require('colors/safe');

module.exports = {compare};

const extensionToMimeType = {
  'png': 'image/png',
  'txt': 'text/plain',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
};

const GoldenComparators = {
  'image/png': compareImages,
  'image/jpeg': compareImages,
  'text/plain': compareText
};


/**
 * @param {?Object} actualBuffer
 * @param {!Buffer} expectedBuffer
 * @param {!string} mimeType
 * @return {?{diff: (!Object:undefined), errorMessage: (string|undefined)}}
 */
function compareImages(actualBuffer, expectedBuffer, mimeType) {
  if (!actualBuffer || !(actualBuffer instanceof Buffer))
    return { errorMessage: 'Actual result should be Buffer.' };

  const actual = mimeType === 'image/png' ? PNG.sync.read(actualBuffer) : jpeg.decode(actualBuffer);
  const expected = mimeType === 'image/png' ? PNG.sync.read(expectedBuffer) : jpeg.decode(expectedBuffer);
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      errorMessage: `Sizes differ; expected image ${expected.width}px X ${expected.height}px, but got ${actual.width}px X ${actual.height}px. `
    };
  }
  const diff = new PNG({width: expected.width, height: expected.height});
  const count = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, {threshold: 0.2});
  return count > 0 ? { diff: PNG.sync.write(diff) } : null;
}

/**
 * @param {?Object} actual
 * @param {!Buffer} expectedBuffer
 * @return {?{diff: (!Object:undefined), errorMessage: (string|undefined)}}
 */
function compareText(actual, expectedBuffer) {
  if (typeof actual !== 'string')
    return { errorMessage: 'Actual result should be string' };
  const expected = expectedBuffer.toString('utf-8');
  if (expected === actual)
    return null;
  const diff = new Diff();
  const result = diff.main(expected, actual);
  diff.cleanupSemantic(result);
  let html = diff.prettyHtml(result);
  const diffStylePath = path.join(__dirname, 'diffstyle.css');
  html = `<link rel="stylesheet" href="file://${diffStylePath}">` + html;
  return {
    diff: html,
    diffExtension: '.html'
  };
}

/**
 * @param {?Object} actual
 * @param {string} path
 * @return {!{pass: boolean, message: (undefined|string)}}
 */
function compare(actual, expectedPath) {
  if (!fs.existsSync(expectedPath)) {
    fs.writeFileSync(expectedPath, actual);
    return {
      pass: false,
      message: expectedPath + ' is missing in golden results, writing actual.'
    };
  }
  const expected = fs.readFileSync(expectedPath);
  const extension = path.extname(expectedPath).substring(1);
  const mimeType = extensionToMimeType[extension];
  const comparator = GoldenComparators[mimeType];
  if (!comparator) {
    return {
      pass: false,
      message: 'Failed to find comparator with type ' + mimeType + ': '  + expectedPath,
    };
  }

  const result = comparator(actual, expected, mimeType);
  if (!result)
    return { pass: true };

  const actualPath = addSuffix(expectedPath, '-actual');
  const diffPath = addSuffix(expectedPath, '-diff', result.diffExtension);
  fs.writeFileSync(actualPath, actual);
  if (result.diff)
    fs.writeFileSync(diffPath, result.diff);
  
  const output = [
    c.red(`Image comparison failed:`),
  ];
  if (result.errorMessage)
    output.push('    ' + result.errorMessage);
  output.push('');
  output.push(`Expected: ${c.yellow(expectedPath)}`);
  output.push(`Received: ${c.yellow(actualPath)}`);
  if (result.diff)
    output.push(`    Diff: ${c.yellow(diffPath)}`);

  return {
    pass: false,
    message: output.join('\n'),
  };
}

/**
 * @param {string} filePath
 * @param {string} suffix
 * @param {string=} customExtension
 * @return {string}
 */
function addSuffix(filePath, suffix, customExtension) {
  const dirname = path.dirname(filePath);
  const ext = path.extname(filePath);
  const name = path.basename(filePath, ext);
  return path.join(dirname, name + suffix + (customExtension || ext));
}
