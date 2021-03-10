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
import * as playwright from '../../../..';
import * as util from 'util';
import { TraceModel } from './traceModel';
import { TraceEvent } from '../common/traceEvents';
import { ServerRouteHandler, HttpServer } from '../../../utils/httpServer';
import { SnapshotServer } from '../../snapshot/snapshotServer';
import { PersistentSnapshotStorage } from '../../snapshot/snapshotStorage';

const fsReadFileAsync = util.promisify(fs.readFile.bind(fs));

type TraceViewerDocument = {
  resourcesDir: string;
  model: TraceModel;
};

class TraceViewer {
  private _document: TraceViewerDocument | undefined;

  async show(traceDir: string) {
    const resourcesDir = path.join(traceDir, 'resources');
    const model = new TraceModel();
    this._document = {
      model,
      resourcesDir,
    };

    // Served by TraceServer
    // - "/tracemodel" - json with trace model.
    //
    // Served by TraceViewer
    // - "/traceviewer/..." - our frontend.
    // - "/file?filePath" - local files, used by sources tab.
    // - "/sha1/<sha1>" - trace resource bodies, used by network previews.
    //
    // Served by SnapshotServer
    // - "/resources/<resourceId>" - network resources from the trace.
    // - "/snapshot/" - root for snapshot frame.
    // - "/snapshot/pageId/..." - actual snapshot html.
    // - "/snapshot/service-worker.js" - service worker that intercepts snapshot resources
    //   and translates them into "/resources/<resourceId>".

    const actionsTrace = fs.readdirSync(traceDir).find(name => name.endsWith('-actions.trace'))!;
    const tracePrefix = path.join(traceDir, actionsTrace.substring(0, actionsTrace.indexOf('-actions.trace')));
    const server = new HttpServer();
    const snapshotStorage = new PersistentSnapshotStorage();
    await snapshotStorage.load(tracePrefix, resourcesDir);
    new SnapshotServer(server, snapshotStorage);

    const traceContent = await fsReadFileAsync(path.join(traceDir, actionsTrace), 'utf8');
    const events = traceContent.split('\n').map(line => line.trim()).filter(line => !!line).map(line => JSON.parse(line)) as TraceEvent[];
    model.appendEvents(events, snapshotStorage);

    const traceModelHandler: ServerRouteHandler = (request, response) => {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(Array.from(this._document!.model.contextEntries.values())));
      return true;
    };
    server.routePath('/contexts', traceModelHandler);

    const traceViewerHandler: ServerRouteHandler = (request, response) => {
      const relativePath = request.url!.substring('/traceviewer/'.length);
      const absolutePath = path.join(__dirname, '..', '..', '..', 'web', ...relativePath.split('/'));
      return server.serveFile(response, absolutePath);
    };
    server.routePrefix('/traceviewer/', traceViewerHandler);

    const fileHandler: ServerRouteHandler = (request, response) => {
      try {
        const url = new URL('http://localhost' + request.url!);
        const search = url.search;
        if (search[0] !== '?')
          return false;
        return server.serveFile(response, search.substring(1));
      } catch (e) {
        return false;
      }
    };
    server.routePath('/file', fileHandler);

    const sha1Handler: ServerRouteHandler = (request, response) => {
      if (!this._document)
        return false;
      const sha1 = request.url!.substring('/sha1/'.length);
      if (sha1.includes('/'))
        return false;
      return server.serveFile(response, path.join(this._document.resourcesDir, sha1));
    };
    server.routePrefix('/sha1/', sha1Handler);

    const urlPrefix = await server.start();

    const browser = await playwright.chromium.launch({ headless: false });
    const uiPage = await browser.newPage({ viewport: null });
    uiPage.on('close', () => process.exit(0));
    await uiPage.goto(urlPrefix + '/traceviewer/traceViewer/index.html');
  }
}

export async function showTraceViewer(traceDir: string) {
  const traceViewer = new TraceViewer();
  await traceViewer.show(traceDir);
}
