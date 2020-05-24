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

import { helper } from './helper';
import * as network from './network';
import { Page, PageBinding } from './page';
import { TimeoutSettings } from './timeoutSettings';
import * as types from './types';
import { Events } from './events';
import { ExtendedEventEmitter } from './extendedEventEmitter';
import { Download } from './download';
import { BrowserBase } from './browser';
import { Log, InnerLogger, Logger, RootLogger } from './logger';
import { FunctionWithSource } from './frames';

export type PersistentContextOptions = {
  viewport?: types.Size | null,
  ignoreHTTPSErrors?: boolean,
  javaScriptEnabled?: boolean,
  bypassCSP?: boolean,
  userAgent?: string,
  locale?: string,
  timezoneId?: string,
  geolocation?: types.Geolocation,
  permissions?: string[],
  extraHTTPHeaders?: network.Headers,
  offline?: boolean,
  httpCredentials?: types.Credentials,
  deviceScaleFactor?: number,
  isMobile?: boolean,
  hasTouch?: boolean,
  colorScheme?: types.ColorScheme,
};

export type BrowserContextOptions = PersistentContextOptions & {
  acceptDownloads?: boolean,
  logger?: Logger,
};

export interface BrowserContext extends InnerLogger {
  setDefaultNavigationTimeout(timeout: number): void;
  setDefaultTimeout(timeout: number): void;
  pages(): Page[];
  newPage(): Promise<Page>;
  cookies(urls?: string | string[]): Promise<network.NetworkCookie[]>;
  addCookies(cookies: network.SetNetworkCookieParam[]): Promise<void>;
  clearCookies(): Promise<void>;
  grantPermissions(permissions: string[], options?: { origin?: string }): Promise<void>;
  clearPermissions(): Promise<void>;
  setGeolocation(geolocation: types.Geolocation | null): Promise<void>;
  setExtraHTTPHeaders(headers: network.Headers): Promise<void>;
  setOffline(offline: boolean): Promise<void>;
  setHTTPCredentials(httpCredentials: types.Credentials | null): Promise<void>;
  addInitScript(script: Function | string | { path?: string, content?: string }, arg?: any): Promise<void>;
  exposeBinding(name: string, playwrightBinding: FunctionWithSource): Promise<void>;
  exposeFunction(name: string, playwrightFunction: Function): Promise<void>;
  route(url: types.URLMatch, handler: network.RouteHandler): Promise<void>;
  unroute(url: types.URLMatch, handler?: network.RouteHandler): Promise<void>;
  waitForEvent(event: string, optionsOrPredicate?: Function | (types.TimeoutOptions & { predicate?: Function })): Promise<any>;
  close(): Promise<void>;
}

export abstract class BrowserContextBase extends ExtendedEventEmitter implements BrowserContext {
  readonly _timeoutSettings = new TimeoutSettings();
  readonly _pageBindings = new Map<string, PageBinding>();
  readonly _options: BrowserContextOptions;
  _routes: { url: types.URLMatch, handler: network.RouteHandler }[] = [];
  _closed = false;
  private readonly _closePromise: Promise<Error>;
  private _closePromiseFulfill: ((error: Error) => void) | undefined;
  readonly _permissions = new Map<string, string[]>();
  readonly _downloads = new Set<Download>();
  readonly _browserBase: BrowserBase;
  private _logger: InnerLogger;

  constructor(browserBase: BrowserBase, options: BrowserContextOptions) {
    super();
    this._browserBase = browserBase;
    this._options = options;
    this._logger = options.logger ? new RootLogger(options.logger) : browserBase;
    this._closePromise = new Promise(fulfill => this._closePromiseFulfill = fulfill);
  }

  protected _abortPromiseForEvent(event: string) {
    return event === Events.BrowserContext.Close ? super._abortPromiseForEvent(event) : this._closePromise;
  }

  protected _computeDeadline(options?: types.TimeoutOptions): number {
    return this._timeoutSettings.computeDeadline(options);
  }

  _browserClosed() {
    for (const page of this.pages())
      page._didClose();
    this._didCloseInternal(true);
  }

  async _didCloseInternal(omitDeleteDownloads = false) {
    this._closed = true;
    this.emit(Events.BrowserContext.Close);
    this._closePromiseFulfill!(new Error('Context closed'));
    if (!omitDeleteDownloads)
      await Promise.all([...this._downloads].map(d => d.delete()));
    this._downloads.clear();
  }

  // BrowserContext methods.
  abstract pages(): Page[];
  abstract newPage(): Promise<Page>;
  abstract cookies(...urls: string[]): Promise<network.NetworkCookie[]>;
  abstract addCookies(cookies: network.SetNetworkCookieParam[]): Promise<void>;
  abstract clearCookies(): Promise<void>;
  abstract _doGrantPermissions(origin: string, permissions: string[]): Promise<void>;
  abstract _doClearPermissions(): Promise<void>;
  abstract setGeolocation(geolocation: types.Geolocation | null): Promise<void>;
  abstract setHTTPCredentials(httpCredentials: types.Credentials | null): Promise<void>;
  abstract setExtraHTTPHeaders(headers: network.Headers): Promise<void>;
  abstract setOffline(offline: boolean): Promise<void>;
  abstract addInitScript(script: string | Function | { path?: string | undefined; content?: string | undefined; }, arg?: any): Promise<void>;
  abstract _doExposeBinding(binding: PageBinding): Promise<void>;
  abstract route(url: types.URLMatch, handler: network.RouteHandler): Promise<void>;
  abstract unroute(url: types.URLMatch, handler?: network.RouteHandler): Promise<void>;
  abstract close(): Promise<void>;

  async exposeFunction(name: string, playwrightFunction: Function): Promise<void> {
    await this.exposeBinding(name, (options, ...args: any) => playwrightFunction(...args));
  }

  async exposeBinding(name: string, playwrightBinding: FunctionWithSource): Promise<void> {
    for (const page of this.pages()) {
      if (page._pageBindings.has(name))
        throw new Error(`Function "${name}" has been already registered in one of the pages`);
    }
    if (this._pageBindings.has(name))
      throw new Error(`Function "${name}" has been already registered`);
    const binding = new PageBinding(name, playwrightBinding);
    this._pageBindings.set(name, binding);
    this._doExposeBinding(binding);
  }

  async grantPermissions(permissions: string[], options?: { origin?: string }) {
    let origin = '*';
    if (options && options.origin) {
      const url = new URL(options.origin);
      origin = url.origin;
    }
    const existing = new Set(this._permissions.get(origin) || []);
    permissions.forEach(p => existing.add(p));
    const list = [...existing.values()];
    this._permissions.set(origin, list);
    await this._doGrantPermissions(origin, list);
  }

  async clearPermissions() {
    this._permissions.clear();
    await this._doClearPermissions();
  }

  setDefaultNavigationTimeout(timeout: number) {
    this._timeoutSettings.setDefaultNavigationTimeout(timeout);
  }

  setDefaultTimeout(timeout: number) {
    this._timeoutSettings.setDefaultTimeout(timeout);
  }

  _isLogEnabled(log: Log): boolean {
    return this._logger._isLogEnabled(log);
  }

  _log(log: Log, message: string | Error, ...args: any[]) {
    return this._logger._log(log, message, ...args);
  }

  async _loadDefaultContext() {
    if (!this.pages().length)
      await this.waitForEvent('page');
    const pages = this.pages();
    await pages[0].waitForLoadState();
    if (pages.length !== 1 || pages[0].url() !== 'about:blank')
      throw new Error(`Arguments can not specify page to be opened (first url is ${pages[0].url()})`);
    if (this._options.isMobile || this._options.locale) {
      // Workaround for:
      // - chromium fails to change isMobile for existing page;
      // - webkit fails to change locale for existing page.
      const oldPage = pages[0];
      await this.newPage();
      await oldPage.close();
    }
  }
}

export function assertBrowserContextIsNotOwned(context: BrowserContextBase) {
  for (const page of context.pages()) {
    if (page._ownedContext)
      throw new Error('Please use browser.newContext() for multi-page scripts that share the context.');
  }
}

export function validateBrowserContextOptions(options: BrowserContextOptions): BrowserContextOptions {
  // Copy all fields manually to strip any extra junk.
  // Especially useful when we share context and launch options for launchPersistent.
  const result: BrowserContextOptions = {
    ignoreHTTPSErrors: options.ignoreHTTPSErrors,
    bypassCSP: options.bypassCSP,
    locale: options.locale,
    timezoneId: options.timezoneId,
    offline: options.offline,
    colorScheme: options.colorScheme,
    acceptDownloads: options.acceptDownloads,
    viewport: options.viewport,
    javaScriptEnabled: options.javaScriptEnabled,
    userAgent: options.userAgent,
    geolocation: options.geolocation,
    permissions: options.permissions,
    extraHTTPHeaders: options.extraHTTPHeaders,
    httpCredentials: options.httpCredentials,
    deviceScaleFactor: options.deviceScaleFactor,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch,
    logger: options.logger,
  };
  if (result.viewport === null && result.deviceScaleFactor !== undefined)
    throw new Error(`"deviceScaleFactor" option is not supported with null "viewport"`);
  if (result.viewport === null && result.isMobile !== undefined)
    throw new Error(`"isMobile" option is not supported with null "viewport"`);
  if (!result.viewport && result.viewport !== null)
    result.viewport = { width: 1280, height: 720 };
  if (result.viewport)
    result.viewport = { ...result.viewport };
  if (result.geolocation)
    result.geolocation = verifyGeolocation(result.geolocation);
  if (result.extraHTTPHeaders)
    result.extraHTTPHeaders = network.verifyHeaders(result.extraHTTPHeaders);
  return result;
}

export function validatePersistentContextOptions(options: PersistentContextOptions): PersistentContextOptions {
  if ((options as any).acceptDownloads !== undefined)
    throw new Error(`Option "acceptDownloads" is not supported for persistent context`);
  return validateBrowserContextOptions(options);
}

export function verifyGeolocation(geolocation: types.Geolocation): types.Geolocation {
  const result = { ...geolocation };
  result.accuracy = result.accuracy || 0;
  const { longitude, latitude, accuracy } = result;
  if (!helper.isNumber(longitude) || longitude < -180 || longitude > 180)
    throw new Error(`Invalid longitude "${longitude}": precondition -180 <= LONGITUDE <= 180 failed.`);
  if (!helper.isNumber(latitude) || latitude < -90 || latitude > 90)
    throw new Error(`Invalid latitude "${latitude}": precondition -90 <= LATITUDE <= 90 failed.`);
  if (!helper.isNumber(accuracy) || accuracy < 0)
    throw new Error(`Invalid accuracy "${accuracy}": precondition 0 <= ACCURACY failed.`);
  return result;
}
