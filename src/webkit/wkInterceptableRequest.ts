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

import * as frames from '../frames';
import { assert, helper } from '../helper';
import * as network from '../network';
import * as types from '../types';
import { Protocol } from './protocol';
import { WKSession } from './wkConnection';

const errorReasons: { [reason: string]: Protocol.Network.ResourceErrorType } = {
  'aborted': 'Cancellation',
  'accessdenied': 'AccessControl',
  'addressunreachable': 'General',
  'blockedbyclient': 'Cancellation',
  'blockedbyresponse': 'General',
  'connectionaborted': 'General',
  'connectionclosed': 'General',
  'connectionfailed': 'General',
  'connectionrefused': 'General',
  'connectionreset': 'General',
  'internetdisconnected': 'General',
  'namenotresolved': 'General',
  'timedout': 'Timeout',
  'failed': 'General',
};

export class WKInterceptableRequest implements network.RouteDelegate {
  private readonly _session: WKSession;
  readonly request: network.Request;
  readonly _requestId: string;
  _interceptedCallback: () => void = () => {};
  private _interceptedPromise: Promise<unknown>;
  readonly _allowInterception: boolean;

  constructor(session: WKSession, allowInterception: boolean, frame: frames.Frame, event: Protocol.Network.requestWillBeSentPayload, redirectedFrom: network.Request | null, documentId: string | undefined) {
    this._session = session;
    this._requestId = event.requestId;
    this._allowInterception = allowInterception;
    const resourceType = event.type ? event.type.toLowerCase() : (redirectedFrom ? redirectedFrom.resourceType() : 'other');
    this.request = new network.Request(allowInterception ? this : null, frame, redirectedFrom, documentId, event.request.url,
        resourceType, event.request.method, event.request.postData || null, headersObject(event.request.headers));
    this._interceptedPromise = new Promise(f => this._interceptedCallback = f);
  }

  async abort(errorCode: string) {
    const errorType = errorReasons[errorCode];
    assert(errorType, 'Unknown error code: ' + errorCode);
    await this._interceptedPromise;
    // In certain cases, protocol will return error if the request was already canceled
    // or the page was closed. We should tolerate these errors.
    await this._session.sendMayFail('Network.interceptRequestWithError', { requestId: this._requestId, errorType });
  }

  async fulfill(response: types.FulfillResponse) {
    await this._interceptedPromise;

    const base64Encoded = !!response.body && !helper.isString(response.body);
    const responseBody = response.body ? (base64Encoded ? response.body.toString('base64') : response.body as string) : '';

    const responseHeaders: { [s: string]: string; } = {};
    if (response.headers) {
      for (const header of Object.keys(response.headers))
        responseHeaders[header.toLowerCase()] = String(response.headers[header]);
    }
    let mimeType = base64Encoded ? 'application/octet-stream' : 'text/plain';
    if (response.contentType) {
      responseHeaders['content-type'] = response.contentType;
      const index = response.contentType.indexOf(';');
      if (index !== -1)
        mimeType = response.contentType.substring(0, index).trimEnd();
      else
        mimeType = response.contentType.trim();
    }
    if (responseBody && !('content-length' in responseHeaders))
      responseHeaders['content-length'] = String(Buffer.byteLength(responseBody));

    // In certain cases, protocol will return error if the request was already canceled
    // or the page was closed. We should tolerate these errors.
    await this._session.sendMayFail('Network.interceptRequestWithResponse', {
      requestId: this._requestId,
      status: response.status || 200,
      statusText: network.STATUS_TEXTS[String(response.status || 200)],
      mimeType,
      headers: responseHeaders,
      base64Encoded,
      content: responseBody
    });
  }

  async continue(overrides: { method?: string; headers?: types.Headers; postData?: string }) {
    await this._interceptedPromise;
    // In certain cases, protocol will return error if the request was already canceled
    // or the page was closed. We should tolerate these errors.
    await this._session.sendMayFail('Network.interceptWithRequest', {
      requestId: this._requestId,
      method: overrides.method,
      headers: overrides.headers,
      postData: overrides.postData ? Buffer.from(overrides.postData).toString('base64') : undefined
    });
  }

  createResponse(responsePayload: Protocol.Network.Response): network.Response {
    const getResponseBody = async () => {
      const response = await this._session.send('Network.getResponseBody', { requestId: this._requestId });
      return Buffer.from(response.body, response.base64Encoded ? 'base64' : 'utf8');
    };
    return new network.Response(this.request, responsePayload.status, responsePayload.statusText, headersObject(responsePayload.headers), getResponseBody);
  }
}

function headersObject(headers: Protocol.Network.Headers): types.Headers {
  const result: types.Headers = {};
  for (const key of Object.keys(headers))
    result[key.toLowerCase()] = headers[key];
  return result;
}
