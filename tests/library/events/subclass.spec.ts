// Copyright Joyent, Inc. and other Node contributors.
// Modifications copyright (c) by Microsoft Corporation
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

import { EventEmitter } from './utils';
import { test, expect } from '@playwright/test';

class MyEE extends EventEmitter {
  constructor(cb) {
    super();
    this.once(1, cb);
    this.emit(1);
    void this.removeAllListeners();
  }
}

test('myee instance', () => {
  const myee = new MyEE(() => {});
  expect(myee._events).not.toBeInstanceOf(Object);
  expect(Object.keys(myee._events).length).toBe(0);
});

class MyEE2 {
  ee: EventEmitter;
  constructor() {
    this.ee = new EventEmitter();
  }
}

test('MyEE2 instance', () => {
  const ee1 = new MyEE2();
  const ee2 = new MyEE2();

  ee1.ee.on('x', function() {});
  expect(ee2.ee.listenerCount('x')).toBe(0);
});
