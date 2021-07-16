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

import fs from 'fs';
import path from 'path';
import yazl from 'yazl';
import { EventEmitter } from 'events';
import { calculateSha1, createGuid, mkdirIfNeeded, monotonicTime } from '../../../utils/utils';
import { Artifact } from '../../artifact';
import { BrowserContext } from '../../browserContext';
import { ElementHandle } from '../../dom';
import { eventsHelper, RegisteredListener } from '../../../utils/eventsHelper';
import { CallMetadata, InstrumentationListener, SdkObject } from '../../instrumentation';
import { Page } from '../../page';
import * as trace from '../common/traceEvents';
import { TraceSnapshotter } from './traceSnapshotter';
import { commandsWithTracingSnapshots } from '../../../protocol/channels';

export type TracerOptions = {
  name?: string;
  snapshots?: boolean;
  screenshots?: boolean;
};

export const VERSION = 1;

export class Tracing implements InstrumentationListener {
  private _appendEventChain = Promise.resolve();
  private _snapshotter: TraceSnapshotter;
  private _eventListeners: RegisteredListener[] = [];
  private _pendingCalls = new Map<string, { sdkObject: SdkObject, metadata: CallMetadata, beforeSnapshot: Promise<void>, actionSnapshot?: Promise<void>, afterSnapshot?: Promise<void> }>();
  private _context: BrowserContext;
  private _traceFile: string | undefined;
  private _resourcesDir: string;
  private _sha1s: string[] = [];
  private _recordingTraceEvents = false;
  private _tracesDir: string;

  constructor(context: BrowserContext) {
    this._context = context;
    this._tracesDir = context._browser.options.tracesDir;
    this._resourcesDir = path.join(this._tracesDir, 'resources');
    this._snapshotter = new TraceSnapshotter(this._context, this._resourcesDir, traceEvent => this._appendTraceEvent(traceEvent));
  }

  async start(options: TracerOptions): Promise<void> {
    // context + page must be the first events added, this method can't have awaits before them.
    if (this._recordingTraceEvents)
      throw new Error('Tracing has already been started');
    this._recordingTraceEvents = true;
    this._traceFile = path.join(this._tracesDir, (options.name || createGuid()) + '.trace');

    this._appendEventChain = mkdirIfNeeded(this._traceFile);
    const event: trace.ContextCreatedTraceEvent = {
      version: VERSION,
      type: 'context-options',
      browserName: this._context._browser.options.name,
      options: this._context._options
    };
    this._appendTraceEvent(event);
    for (const page of this._context.pages())
      this._onPage(options.screenshots, page);
    this._eventListeners.push(
        eventsHelper.addEventListener(this._context, BrowserContext.Events.Page, this._onPage.bind(this, options.screenshots)),
    );

    // context + page must be the first events added, no awaits above this line.
    await fs.promises.mkdir(this._resourcesDir, { recursive: true });

    this._context.instrumentation.addListener(this);
    if (options.snapshots)
      await this._snapshotter.start();
  }

  async stop(): Promise<void> {
    if (!this._eventListeners.length)
      return;
    this._context.instrumentation.removeListener(this);
    eventsHelper.removeEventListeners(this._eventListeners);
    for (const { sdkObject, metadata, beforeSnapshot, actionSnapshot, afterSnapshot } of this._pendingCalls.values()) {
      await Promise.all([beforeSnapshot, actionSnapshot, afterSnapshot]);
      if (!afterSnapshot)
        metadata.error = { error: { name: 'Error', message: 'Action was interrupted' } };
      await this.onAfterCall(sdkObject, metadata);
    }
    for (const page of this._context.pages())
      page.setScreencastOptions(null);
    await this._snapshotter.stop();

    // Ensure all writes are finished.
    this._recordingTraceEvents = false;
    await this._appendEventChain;
  }

  async dispose() {
    await this._snapshotter.dispose();
  }

  async export(): Promise<Artifact> {
    if (!this._traceFile || this._recordingTraceEvents)
      throw new Error('Must start and stop tracing before exporting');
    const zipFile = new yazl.ZipFile();
    const failedPromise = new Promise<Artifact>((_, reject) => (zipFile as any as EventEmitter).on('error', reject));

    const succeededPromise = new Promise<Artifact>(async fulfill => {
      zipFile.addFile(this._traceFile!, 'trace.trace');
      const zipFileName = this._traceFile! + '.zip';
      for (const sha1 of this._sha1s)
        zipFile.addFile(path.join(this._resourcesDir!, sha1), path.join('resources', sha1));
      zipFile.end();
      await new Promise(f => {
        zipFile.outputStream.pipe(fs.createWriteStream(zipFileName)).on('close', f);
      });
      const artifact = new Artifact(this._context, zipFileName);
      artifact.reportFinished();
      fulfill(artifact);
    });
    return Promise.race([failedPromise, succeededPromise]);
  }

  async _captureSnapshot(name: 'before' | 'after' | 'action' | 'event', sdkObject: SdkObject, metadata: CallMetadata, element?: ElementHandle) {
    if (!sdkObject.attribution.page)
      return;
    if (!this._snapshotter.started())
      return;
    if (!shouldCaptureSnapshot(metadata))
      return;
    const snapshotName = `${name}@${metadata.id}`;
    metadata.snapshots.push({ title: name, snapshotName });
    await this._snapshotter!.captureSnapshot(sdkObject.attribution.page, snapshotName, element);
  }

  async onBeforeCall(sdkObject: SdkObject, metadata: CallMetadata) {
    const beforeSnapshot = this._captureSnapshot('before', sdkObject, metadata);
    this._pendingCalls.set(metadata.id, { sdkObject, metadata, beforeSnapshot });
    await beforeSnapshot;
  }

  async onBeforeInputAction(sdkObject: SdkObject, metadata: CallMetadata, element: ElementHandle) {
    const actionSnapshot = this._captureSnapshot('action', sdkObject, metadata, element);
    this._pendingCalls.get(metadata.id)!.actionSnapshot = actionSnapshot;
    await actionSnapshot;
  }

  async onAfterCall(sdkObject: SdkObject, metadata: CallMetadata) {
    const pendingCall = this._pendingCalls.get(metadata.id);
    if (!pendingCall || pendingCall.afterSnapshot)
      return;
    if (!sdkObject.attribution.page) {
      this._pendingCalls.delete(metadata.id);
      return;
    }
    pendingCall.afterSnapshot = this._captureSnapshot('after', sdkObject, metadata);
    await pendingCall.afterSnapshot;
    const event: trace.ActionTraceEvent = { type: 'action', metadata, hasSnapshot: shouldCaptureSnapshot(metadata) };
    this._appendTraceEvent(event);
    this._pendingCalls.delete(metadata.id);
  }

  onEvent(sdkObject: SdkObject, metadata: CallMetadata) {
    if (!sdkObject.attribution.page)
      return;
    const event: trace.ActionTraceEvent = { type: 'event', metadata, hasSnapshot: false };
    this._appendTraceEvent(event);
  }

  private _onPage(screenshots: boolean | undefined, page: Page) {
    if (screenshots)
      page.setScreencastOptions({ width: 800, height: 600, quality: 90 });

    this._eventListeners.push(
        eventsHelper.addEventListener(page, Page.Events.ScreencastFrame, params => {
          const sha1 = calculateSha1(createGuid()); // no need to compute sha1 for screenshots
          const event: trace.ScreencastFrameTraceEvent = {
            type: 'screencast-frame',
            pageId: page.guid,
            sha1,
            width: params.width,
            height: params.height,
            timestamp: monotonicTime()
          };
          this._appendTraceEvent(event);
          this._appendEventChain = this._appendEventChain.then(async () => {
            await fs.promises.writeFile(path.join(this._resourcesDir!, sha1), params.buffer).catch(() => {});
          });
        }),
    );
  }

  private _appendTraceEvent(event: any) {
    if (!this._recordingTraceEvents)
      return;

    const visit = (object: any) => {
      if (Array.isArray(object)) {
        object.forEach(visit);
        return;
      }
      if (typeof object === 'object') {
        for (const key in object) {
          if (key === 'sha1' || key.endsWith('Sha1')) {
            const sha1 = object[key];
            if (sha1)
              this._sha1s.push(sha1);
          }
          visit(object[key]);
        }
        return;
      }
    };
    visit(event);

    // Serialize all writes to the trace file.
    this._appendEventChain = this._appendEventChain.then(async () => {
      await fs.promises.appendFile(this._traceFile!, JSON.stringify(event) + '\n');
    });
  }
}

export function shouldCaptureSnapshot(metadata: CallMetadata): boolean {
  return commandsWithTracingSnapshots.has(metadata.type + '.' + metadata.method);
}
