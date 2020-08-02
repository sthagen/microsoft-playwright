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

import { PageChannel, PageKeyboardTypeOptions, PageKeyboardPressOptions, PageMouseDownOptions, PageMouseUpOptions, PageMouseClickOptions } from '../channels';

export class Keyboard {
  private _channel: PageChannel;

  constructor(channel: PageChannel) {
    this._channel = channel;
  }

  async down(key: string) {
    await this._channel.keyboardDown({ key });
  }

  async up(key: string) {
    await this._channel.keyboardUp({ key });
  }

  async insertText(text: string) {
    await this._channel.keyboardInsertText({ text });
  }

  async type(text: string, options: PageKeyboardTypeOptions = {}) {
    await this._channel.keyboardType({ text, ...options });
  }

  async press(key: string, options: PageKeyboardPressOptions = {}) {
    await this._channel.keyboardPress({ key, ...options });
  }
}

export class Mouse {
  private _channel: PageChannel;

  constructor(channel: PageChannel) {
    this._channel = channel;
  }

  async move(x: number, y: number, options: { steps?: number } = {}) {
    await this._channel.mouseMove({ x, y, ...options });
  }

  async down(options: PageMouseDownOptions = {}) {
    await this._channel.mouseDown({ ...options });
  }

  async up(options: PageMouseUpOptions = {}) {
    await this._channel.mouseUp(options);
  }

  async click(x: number, y: number, options: PageMouseClickOptions = {}) {
    await this._channel.mouseClick({ x, y, ...options });
  }

  async dblclick(x: number, y: number, options: Omit<PageMouseClickOptions, 'clickCount'> = {}) {
    await this.click(x, y, { ...options, clickCount: 2 });
  }
}
