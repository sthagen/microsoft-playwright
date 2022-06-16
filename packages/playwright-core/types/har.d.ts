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

// see http://www.softwareishard.com/blog/har-12-spec/
export type HARFile = {
  log: HARLog;
}

export type HARLog = {
  version: string;
  creator: HARCreator;
  browser?: HARBrowser;
  pages?: HARPage[];
  entries: HAREntry[];
  comment?: string;
};

export type HARCreator = {
  name: string;
  version: string;
  comment?: string;
};

export type HARBrowser = {
  name: string;
  version: string;
  comment?: string;
};

export type HARPage = {
  startedDateTime: string;
  id: string;
  title: string;
  pageTimings: HARPageTimings;
  comment?: string;
};

export type HARPageTimings = {
  onContentLoad?: number;
  onLoad?: number;
  comment?: string;
};

export type HAREntry = {
  pageref?: string;
  startedDateTime: string;
  time: number;
  request: HARRequest;
  response: HARResponse;
  cache: HARCache;
  timings: HARTimings;
  serverIPAddress?: string;
  connection?: string;
  comment?: string;
};

export type HARRequest = {
  method: string;
  url: string;
  httpVersion: string;
  cookies: HARCookie[];
  headers: HARHeader[];
  queryString: HARQueryParameter[];
  postData?: HARPostData;
  headersSize: number;
  bodySize: number;
  comment?: string;
};

export type HARResponse = {
  status: number;
  statusText: string;
  httpVersion: string;
  cookies: HARCookie[];
  headers: HARHeader[];
  content: HARContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
  comment?: string;
};

export type HARCookie = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  comment?: string;
};

export type HARHeader = {
  name: string;
  value: string;
  comment?: string;
};

export type HARQueryParameter = {
  name: string;
  value: string;
  comment?: string;
};

export type HARPostData = {
  mimeType: string;
  params: HARParam[];
  text: string;
  comment?: string;
};

export type HARParam = {
  name: string;
  value?: string;
  fileName?: string;
  contentType?: string;
  comment?: string;
};

export type HARContent = {
  size: number;
  compression?: number;
  mimeType: string;
  text?: string;
  encoding?: string;
  comment?: string;
};

export type HARCache = {
  beforeRequest?: HARCacheState;
  afterRequest?: HARCacheState;
  comment?: string;
};

export type HARCacheState = {
  expires?: string;
  lastAccess: string;
  eTag: string;
  hitCount: number;
  comment?: string;
};

export type HARTimings = {
  blocked?: number;
  dns?: number;
  connect?: number;
  send: number;
  wait: number;
  receive: number;
  ssl?: number;
  comment?: string;
};
