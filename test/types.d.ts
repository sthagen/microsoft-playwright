type ServerResponse = import('http').ServerResponse;
type IncomingMessage = import('http').IncomingMessage;

type Falsy = false|''|0|null|undefined;
interface Expect<T> {
    toBe(other: T, message?: string): void;
    toBeFalsy(message?: string): void;
    toBeTruthy(message?: string): void;
    toContain(other: any, message?: string): void;
    toEqual(other: T, message?: string): void;
    toBeNull(message?: string): void;
    toBeInstanceOf(other: Function, message?: string): void;

    toBeGreaterThan(other: number, message?: string): void;
    toBeGreaterThanOrEqual(other: number, message?: string): void;
    toBeLessThan(other: number, message?: string): void;
    toBeLessThanOrEqual(other: number, message?: string): void;
    toBeCloseTo(other: number, precision: number, message?: string): void;

    toBeGolden(golden: {goldenPath: string, outputPath: string, goldenName: string}): void;

    not: Expect<T>;
}

type DescribeFunction = ((name: string, inner: () => void) => void) & {fail(condition: boolean): DescribeFunction};

type ItFunction<STATE> = ((name: string, inner: (state: STATE) => Promise<void>) => void) & {
    fail(condition: boolean): ItFunction<STATE>;
    skip(condition: boolean): ItFunction<STATE>;
    slow(): ItFunction<STATE>;
    repeat(n: number): ItFunction<STATE>;
};

type TestRunner<STATE> = {
    describe: DescribeFunction;
    xdescribe: DescribeFunction;
    fdescribe: DescribeFunction;

    it: ItFunction<STATE>;
    xit: ItFunction<STATE>;
    fit: ItFunction<STATE>;
    dit: ItFunction<STATE>;

    beforeAll, beforeEach, afterAll, afterEach;
};

interface TestSetup<STATE> {
    testRunner: TestRunner<STATE>;
    product: 'Chromium'|'Firefox'|'WebKit';
    FFOX: boolean;
    WEBKIT: boolean;
    CHROMIUM: boolean;
    MAC: boolean;
    LINUX: boolean;
    WIN: boolean;
    playwright: typeof import('../index');
    browserType: import('../index').BrowserType<import('../index').Browser>;
    selectors: import('../index').Selectors;
    expect<T>(value: T): Expect<T>;
    defaultBrowserOptions: import('../index').LaunchOptions;
    playwrightPath;
    headless: boolean;
    ASSETS_DIR: string;
}

type TestState = {
    server: TestServer;
    httpsServer: TestServer;
    sourceServer: TestServer;
};

type BrowserState = TestState & {
    browser: import('../index').Browser;
    browserServer: import('../index').BrowserServer;
};

type PageState = BrowserState & {
    context: import('../index').BrowserContext;
    page: import('../index').Page;
};
type ChromiumPageState = PageState & {
    browser: import('../index').ChromiumBrowser;
};
type TestSuite = (setup: TestSetup<TestState>) => void;
type BrowserTestSuite = (setup: TestSetup<BrowserState>) => void;
type PageTestSuite = (setup: TestSetup<PageState>) => void;
type ChromiumTestSuite = (setup: TestSetup<ChromiumPageState>) => void;


interface TestServer {
    enableHTTPCache(pathPrefix: string);
    setAuth(path: string, username: string, password: string);
    enableGzip(path: string);
    setCSP(path: string, csp: string);
    stop(): Promise<void>;
    setRoute(path: string, handler: (message: IncomingMessage, response: ServerResponse) => void);
    setRedirect(from: string, to: string);
    waitForRequest(path: string): Promise<IncomingMessage>;
    reset();
    serveFile(request: IncomingMessage, response: ServerResponse, pathName: string);

    PORT: number;
    PREFIX: string;
    CROSS_PROCESS_PREFIX: string;
    EMPTY_PAGE: string;

}

declare const describe: DescribeFunction;
declare const fdescribe: DescribeFunction;
declare const xdescribe: DescribeFunction;
declare function expect<T>(value: T): Expect<T>;
declare const it: ItFunction<PageState>;
declare const fit: ItFunction<PageState>;
declare const dit: ItFunction<PageState>;
declare const xit: ItFunction<PageState>;

declare const browserType: import('../index').BrowserType<import('../index').Browser>;

// global variables in assets

// keyboard.html
declare function getResult(): string;
