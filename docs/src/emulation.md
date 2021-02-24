---
id: emulation
title: "Emulation"
---

Playwright allows overriding various parameters of the device where the browser is running:
- viewport size, device scale factor, touch support
- locale, timezone
- color scheme
- geolocation

Most of these parameters are configured during the browser context construction, but some of them such as viewport size
can be changed for individual pages.

<!-- TOC -->

<br/>

## Devices
* langs: js, python

Playwright comes with a registry of device parameters for selected mobile devices. It can be used to simulate browser
behavior on a mobile device:

```js
const { chromium, devices } = require('playwright');
const browser = await chromium.launch();

const pixel2 = devices['Pixel 2'];
const context = await browser.newContext({
  ...pixel2,
});
```

```python async
import asyncio
from playwright.async_api import async_playwright

async def run(playwright):
    pixel_2 = playwright.devices['Pixel 2']
    browser = await playwright.webkit.launch(headless=False)
    context = await browser.new_context(
        **pixel_2,
    )

async def main():
    async with async_playwright() as playwright:
        await run(playwright)
asyncio.run(main())
```

```python sync
from playwright.sync_api import sync_playwright

def run(playwright):
    pixel_2 = playwright.devices['Pixel 2']
    browser = playwright.webkit.launch(headless=False)
    context = browser.new_context(
        **pixel_2,
    )

with sync_playwright() as playwright:
    run(playwright)
```

All pages created in the context above will share the same device parameters.

### API reference
- [`property: Playwright.devices`]
- [`method: Browser.newContext`]

<br/>

## User agent

All pages created in the context above will share the user agent specified:

```js
const context = await browser.newContext({
  userAgent: 'My user agent'
});
```

```python async
context = await browser.new_context(
  user_agent='My user agent'
)
```

```python sync
context = browser.new_context(
  user_agent='My user agent'
)
```

### API reference
- [`method: Browser.newContext`]

<br/>

## Viewport

Create a context with custom viewport size:

```js
// Create context with given viewport
const context = await browser.newContext({
  viewport: { width: 1280, height: 1024 }
});

// Resize viewport for individual page
await page.setViewportSize({ width: 1600, height: 1200 });

// Emulate high-DPI
const context = await browser.newContext({
  viewport: { width: 2560, height: 1440 },
  deviceScaleFactor: 2,
});
```

```python async
# Create context with given viewport
context = await browser.new_context(
  viewport={ 'width': 1280, 'height': 1024 }
)

# Resize viewport for individual page
await page.set_viewport_size(width=1600, height=1200)

# Emulate high-DPI
context = await browser.new_context(
  viewport={ 'width': 2560, 'height': 1440 },
  device_scale_factor=2,
)
```

```python sync
# Create context with given viewport
context = browser.new_context(
  viewport={ 'width': 1280, 'height': 1024 }
)

# Resize viewport for individual page
page.set_viewport_size(width=1600, height=1200)

# Emulate high-DPI
context = browser.new_context(
  viewport={ 'width': 2560, 'height': 1440 },
  device_scale_factor=2,
```

### API reference
- [`method: Browser.newContext`]
- [`method: Page.setViewportSize`]

<br/>

## Locale & timezone

```js
// Emulate locale and time
const context = await browser.newContext({
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
});
```

```python async
# Emulate locale and time
context = await browser.new_context(
  locale='de-DE',
  timezone_id='Europe/Berlin',
)
```

```python sync
# Emulate locale and time
context = browser.new_context(
  locale='de-DE',
  timezone_id='Europe/Berlin',
)
```

### API reference
- [`method: Browser.newContext`]

<br/>

## Permissions

Allow all pages in the context to show system notifications:

```js
const context = await browser.newContext({
  permissions: ['notifications'],
});
```

```python async
context = await browser.new_context(
  permissions=['notifications'],
)
```

```python sync
context = browser.new_context(
  permissions=['notifications'],
)
```

Grant all pages in the existing context access to current location:

```js
await context.grantPermissions(['geolocation']);
```

```python async
await context.grant_permissions(['geolocation'])
```

```python sync
context.grant_permissions(['geolocation'])
```

Grant notifications access from a specific domain:

```js
await context.grantPermissions(['notifications'], {origin: 'https://skype.com'} );
```

```python async
await context.grant_permissions(['notifications'], origin='https://skype.com')
```

```python sync
context.grant_permissions(['notifications'], origin='https://skype.com')
```

Revoke all permissions:

```js
await context.clearPermissions();
```

```python async
await context.clear_permissions()
```

```python sync
context.clear_permissions()
```

### API reference
- [`method: Browser.newContext`]
- [`method: BrowserContext.grantPermissions`]
- [`method: BrowserContext.clearPermissions`]

<br/>

## Geolocation

Create a context with `"geolocation"` permissions granted:

```js
const context = await browser.newContext({
  geolocation: { longitude: 48.858455, latitude: 2.294474 },
  permissions: ['geolocation']
});
```

```python async
context = await browser.new_context(
  geolocation={"longitude": 48.858455, "latitude": 2.294474},
  permissions=["geolocation"]
)
```

```python sync
context = browser.new_context(
  geolocation={"longitude": 48.858455, "latitude": 2.294474},
  permissions=["geolocation"]
)
```

Change the location later:

```js
await context.setGeolocation({ longitude: 29.979097, latitude: 31.134256 });
```

```python async
await context.set_geolocation({"longitude": 29.979097, "latitude": 31.134256})
```

```python sync
context.set_geolocation({"longitude": 29.979097, "latitude": 31.134256})
```

**Note** you can only change geolocation for all pages in the context.

### API reference
- [`method: Browser.newContext`]
- [`method: BrowserContext.setGeolocation`]

<br/>

## Color scheme and media

Create a context with dark or light mode. Pages created in this context will follow this color scheme preference.

```js
// Create context with dark mode
const context = await browser.newContext({
  colorScheme: 'dark' // or 'light'
});

// Create page with dark mode
const page = await browser.newPage({
  colorScheme: 'dark' // or 'light'
});

// Change color scheme for the page
await page.emulateMedia({ colorScheme: 'dark' });

// Change media for page
await page.emulateMedia({ media: 'print' });
```

```python async
# Create context with dark mode
context = await browser.new_context(
  color_scheme='dark' # or 'light'
)

# Create page with dark mode
page = await browser.new_page(
  color_scheme='dark' # or 'light'
)

# Change color scheme for the page
await page.emulate_media(color_scheme='dark')

# Change media for page
await page.emulate_media(media='print')
```

```python sync
# Create context with dark mode
context = browser.new_context(
  color_scheme='dark' # or 'light'
)

# Create page with dark mode
page = browser.new_page(
  color_scheme='dark' # or 'light'
)

# Change color scheme for the page
page.emulate_media(color_scheme='dark')

# Change media for page
page.emulate_media(media='print')
```

### API reference
- [`method: Browser.newContext`]
- [`method: Page.emulateMedia`]