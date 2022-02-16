#!/bin/bash
source ./initialize_test.sh && initialize_test "$@"

npm_i playwright-core
OUTPUT=$(npm_i --foreground-script playwright)
if [[ "${OUTPUT}" != *"chromium"* ]]; then
  echo "ERROR: should download chromium"
  exit 1
fi
if [[ "${OUTPUT}" != *"firefox"* ]]; then
  echo "ERROR: should download firefox"
  exit 1
fi
if [[ "${OUTPUT}" != *"webkit"* ]]; then
  echo "ERROR: should download webkit"
  exit 1
fi

echo "Running sanity.js"
node sanity.js playwright
if [[ ${NODE_VERSION} -ge 14 ]]; then
  echo "Running esm.js"
  node esm-playwright.mjs
fi

echo "Running playwright test"
if npx playwright test -c .; then
  echo "ERROR: should not be able to run tests with just playwright package"
  exit 1
fi

