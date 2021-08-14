---
id: why-playwright
title: "Why Playwright?"
---

Playwright enables fast, reliable and capable testing and automation across all modern browsers. This guide covers those key differentiators to help you decide on the right tool for your automated tests.

<!-- TOC -->
- [Release notes](./release-notes.md)

## Support for all browsers
* **Test on Chromium, Firefox and WebKit**. Playwright has full API coverage for all modern browsers, including Google Chrome and Microsoft Edge (with [Chromium](https://www.chromium.org/)), Apple Safari (with [WebKit](https://webkit.org/)) and Mozilla Firefox.

* **Cross-platform WebKit testing**. With Playwright, test how your app behaves in Apple Safari with WebKit builds for Windows, Linux and macOS. Test locally and on CI.

* **Test for mobile**. Use [device emulation](./emulation.md) to test your responsive web apps in mobile web browsers.

* **Headless and headed**. Playwright supports headless (without browser UI) and headed (with browser UI) modes for all browsers and all platforms. Headed is great for debugging, and headless is faster and suited for CI/cloud executions.

## Fast and reliable execution
* **Auto-wait APIs**. Playwright interactions [auto-wait for elements](./actionability.md) to be ready. This improves reliability and simplifies test authoring.

* **Timeout-free automation**. Playwright receives browser signals, like network requests, page navigations and page load events to eliminate the need for sleep timeouts that cause flakiness.

* **Fast isolation with browser contexts**. Reuse a single browser instance for multiple isolated execution environments with [browser contexts](./core-concepts.md).

* **Resilient element selectors**. Playwright can rely on user-facing strings, like text content and accessibility labels to [select elements](./selectors.md). These strings are more resilient than selectors tightly-coupled to the DOM structure.

## Powerful automation capabilities
* **Multiple domains, pages and frames**. Playwright is an out-of-process automation driver that is not limited by the scope of in-page JavaScript execution and can automate scenarios with [multiple pages](./multi-pages.md).

* **Powerful network control**. Playwright introduces context-wide [network interception](./network.md) to stub and mock network requests.

* **Modern web features**. Playwright supports web components through [shadow-piercing selectors](./selectors.md), [geolocation, permissions](./emulation.md), web workers and other modern web APIs.

* **Capabilities to cover all scenarios**. Support for [file downloads](./downloads.md) and [uploads](./input.md), out-of-process iframes, native [input events](./input.md), and even [dark mode](./emulation.md).

## Limitations

* **Legacy Edge and IE11 support**. Playwright does not support legacy Microsoft Edge or IE11 ([deprecation notice](https://techcommunity.microsoft.com/t5/microsoft-365-blog/microsoft-365-apps-say-farewell-to-internet-explorer-11-and/ba-p/1591666)). The new Microsoft Edge (on Chromium) is supported.

* **Test on real mobile devices**: Playwright uses desktop browsers to emulate mobile devices. There is experimental [Android] support available. If you are interested in iOS, please [upvote this issue](https://github.com/microsoft/playwright/issues/1122).
