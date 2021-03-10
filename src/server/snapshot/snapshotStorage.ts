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

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { ContextResources, FrameSnapshot, ResourceSnapshot } from './snapshotTypes';
import { SnapshotRenderer } from './snapshotRenderer';

export interface SnapshotStorage {
  resources(): ResourceSnapshot[];
  resourceContent(sha1: string): Buffer | undefined;
  resourceById(resourceId: string): ResourceSnapshot | undefined;
  snapshotByName(frameId: string, snapshotName: string): SnapshotRenderer | undefined;
  snapshotByTime(frameId: string, timestamp: number): SnapshotRenderer | undefined;
}

export abstract class BaseSnapshotStorage extends EventEmitter implements SnapshotStorage {
  protected _resources: ResourceSnapshot[] = [];
  protected _resourceMap = new Map<string, ResourceSnapshot>();
  protected _frameSnapshots = new Map<string, {
    raw: FrameSnapshot[],
    renderer: SnapshotRenderer[]
  }>();
  protected _contextResources: ContextResources = new Map();

  addResource(resource: ResourceSnapshot): void {
    this._resourceMap.set(resource.resourceId, resource);
    this._resources.push(resource);
    let resources = this._contextResources.get(resource.url);
    if (!resources) {
      resources = [];
      this._contextResources.set(resource.url, resources);
    }
    resources.push({ frameId: resource.frameId, resourceId: resource.resourceId });
  }

  addFrameSnapshot(snapshot: FrameSnapshot): void {
    let frameSnapshots = this._frameSnapshots.get(snapshot.frameId);
    if (!frameSnapshots) {
      frameSnapshots = {
        raw: [],
        renderer: [],
      };
      this._frameSnapshots.set(snapshot.frameId, frameSnapshots);
    }
    frameSnapshots.raw.push(snapshot);
    const renderer = new SnapshotRenderer(new Map(this._contextResources), frameSnapshots.raw, frameSnapshots.raw.length - 1);
    frameSnapshots.renderer.push(renderer);
    this.emit('snapshot', renderer);
  }

  abstract resourceContent(sha1: string): Buffer | undefined;

  resourceById(resourceId: string): ResourceSnapshot | undefined {
    return this._resourceMap.get(resourceId)!;
  }

  resources(): ResourceSnapshot[] {
    return this._resources.slice();
  }

  snapshotByName(frameId: string, snapshotName: string): SnapshotRenderer | undefined {
    return this._frameSnapshots.get(frameId)?.renderer.find(r => r.snapshotName === snapshotName);
  }

  snapshotByTime(frameId: string, timestamp: number): SnapshotRenderer | undefined {
    let result: SnapshotRenderer | undefined = undefined;
    for (const snapshot of this._frameSnapshots.get(frameId)?.renderer.values() || []) {
      if (timestamp && snapshot.snapshot().timestamp <= timestamp)
        result = snapshot;
    }
    return result;
  }
}

const fsReadFileAsync = util.promisify(fs.readFile.bind(fs));

export class PersistentSnapshotStorage extends BaseSnapshotStorage {
  private _resourcesDir: any;

  async load(tracePrefix: string, resourcesDir: string) {
    this._resourcesDir = resourcesDir;
    const networkTrace = await fsReadFileAsync(tracePrefix + '-network.trace', 'utf8');
    const resources = networkTrace.split('\n').map(line => line.trim()).filter(line => !!line).map(line => JSON.parse(line)) as ResourceSnapshot[];
    resources.forEach(r => this.addResource(r));
    const snapshotTrace = await fsReadFileAsync(path.join(tracePrefix + '-dom.trace'), 'utf8');
    const snapshots = snapshotTrace.split('\n').map(line => line.trim()).filter(line => !!line).map(line => JSON.parse(line)) as FrameSnapshot[];
    snapshots.forEach(s => this.addFrameSnapshot(s));
  }

  resourceContent(sha1: string): Buffer | undefined {
    return fs.readFileSync(path.join(this._resourcesDir, sha1));
  }
}
