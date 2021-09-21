/**
 * Copyright (c) Microsoft Corporation.
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

import { HttpServer } from '../../utils/httpServer';
import { BrowserContext } from '../browserContext';
import { eventsHelper } from '../../utils/eventsHelper';
import { Page } from '../page';
import { FrameSnapshot } from './snapshotTypes';
import { SnapshotRenderer } from './snapshotRenderer';
import { SnapshotServer } from './snapshotServer';
import { BaseSnapshotStorage } from './snapshotStorage';
import { Snapshotter, SnapshotterBlob, SnapshotterDelegate } from './snapshotter';
import { ElementHandle } from '../dom';
import { HarTracer, HarTracerDelegate } from '../supplements/har/harTracer';
import * as har from '../supplements/har/har';

export class InMemorySnapshotter extends BaseSnapshotStorage implements SnapshotterDelegate, HarTracerDelegate {
  private _blobs = new Map<string, Buffer>();
  private _server: HttpServer;
  private _snapshotter: Snapshotter;
  private _harTracer: HarTracer;

  constructor(context: BrowserContext) {
    super();
    this._server = new HttpServer();
    new SnapshotServer(this._server, this);
    this._snapshotter = new Snapshotter(context, this);
    this._harTracer = new HarTracer(context, this, { content: 'sha1', waitForContentOnStop: false, skipScripts: true });
  }

  async initialize(): Promise<string> {
    await this._snapshotter.start();
    this._harTracer.start();
    return await this._server.start();
  }

  async reset() {
    await this._snapshotter.reset();
    await this._harTracer.flush();
    this._harTracer.stop();
    this._harTracer.start();
    this.clear();
  }

  async dispose() {
    this._snapshotter.dispose();
    await this._harTracer.flush();
    this._harTracer.stop();
    await this._server.stop();
  }

  async captureSnapshot(page: Page, snapshotName: string, element?: ElementHandle): Promise<SnapshotRenderer> {
    if (this._frameSnapshots.has(snapshotName))
      throw new Error('Duplicate snapshot name: ' + snapshotName);

    this._snapshotter.captureSnapshot(page, snapshotName, element).catch(() => {});
    return new Promise<SnapshotRenderer>(fulfill => {
      const listener = eventsHelper.addEventListener(this, 'snapshot', (renderer: SnapshotRenderer) => {
        if (renderer.snapshotName === snapshotName) {
          eventsHelper.removeEventListeners([listener]);
          fulfill(renderer);
        }
      });
    });
  }

  onEntryStarted(entry: har.Entry) {
  }

  onEntryFinished(entry: har.Entry) {
    this.addResource(entry);
  }

  onContentBlob(sha1: string, buffer: Buffer) {
    this._blobs.set(sha1, buffer);
  }

  onSnapshotterBlob(blob: SnapshotterBlob): void {
    this._blobs.set(blob.sha1, blob.buffer);
  }

  onFrameSnapshot(snapshot: FrameSnapshot): void {
    this.addFrameSnapshot(snapshot);
  }

  resourceContent(sha1: string): Buffer | undefined {
    return this._blobs.get(sha1);
  }
}
