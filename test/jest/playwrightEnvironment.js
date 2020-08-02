/**
 * Copyright Microsoft Corporation. All rights reserved.
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

const NodeEnvironment = require('jest-environment-node');
const registerFixtures = require('./fixtures');
const os = require('os');
const path = require('path');
const fs = require('fs');
const debug = require('debug');
const platform = process.env.REPORT_ONLY_PLATFORM || os.platform();
const GoldenUtils = require('../../utils/testrunner/GoldenUtils');
const {installCoverageHooks} = require('./coverage');
const browserName = process.env.BROWSER || 'chromium';
const reportOnly = !!process.env.REPORT_ONLY_PLATFORM;

class PlaywrightEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);
    this.fixturePool = new FixturePool();
    const testOptions = {};
    testOptions.MAC = platform === 'darwin';
    testOptions.LINUX = platform === 'linux';
    testOptions.WIN = platform === 'win32';
    testOptions.CHROMIUM = browserName === 'chromium';
    testOptions.FFOX = browserName === 'firefox';
    testOptions.WEBKIT = browserName === 'webkit';
    testOptions.USES_HOOKS = process.env.PWCHANNEL === 'wire';
    testOptions.CHANNEL = !!process.env.PWCHANNEL;
    testOptions.HEADLESS = !!valueFromEnv('HEADLESS', true);
    testOptions.ASSETS_DIR = path.join(__dirname, '..', 'assets');
    testOptions.GOLDEN_DIR = path.join(__dirname, '..', 'golden-' + browserName);
    testOptions.OUTPUT_DIR = path.join(__dirname, '..', 'output-' + browserName);
    this.global.testOptions = testOptions;
    this.testPath = context.testPath;

    this.global.registerFixture = (name, fn) => {
      this.fixturePool.registerFixture(name, 'test', fn);
    };
    this.global.registerWorkerFixture = (name, fn) => {
      this.fixturePool.registerFixture(name, 'worker', fn);
    };
    registerFixtures(this.global);

    process.on('SIGINT', async () => {
      await this.fixturePool.teardownScope('test');
      await this.fixturePool.teardownScope('worker');
      process.exit(130);
    });
  }

  async setup() {
    await super.setup();
    const {coverage, uninstall} = installCoverageHooks(browserName);
    this.coverage = coverage;
    this.uninstallCoverage = uninstall;
  }

  async teardown() {
    await this.fixturePool.teardownScope('worker');
    await super.teardown();
    // If the setup throws an error, we don't want to override it
    // with a useless error about this.coverage not existing.
    if (!this.coverage)
      return;
    this.uninstallCoverage();
    const testRoot = path.join(__dirname, '..');
    const relativeTestPath = path.relative(testRoot, this.testPath);
    const coveragePath = path.join(this.global.testOptions.OUTPUT_DIR, 'coverage', relativeTestPath + '.json');
    const coverageJSON = [...this.coverage.keys()].filter(key => this.coverage.get(key));
    await fs.promises.mkdir(path.dirname(coveragePath), { recursive: true });
    await fs.promises.writeFile(coveragePath, JSON.stringify(coverageJSON, undefined, 2), 'utf8');
    delete this.coverage;
    delete this.uninstallCoverage;
  }

  runScript(script) {
    return super.runScript(script);
  }

  patchToEnableFixtures(object, name) {
    const original = object[name];
    object[name] = fn => {
      return original(async () => {
        return await this.fixturePool.resolveParametersAndRun(fn);
      });
    }
  }

  async handleTestEvent(event, state) {
    if (event.name === 'setup') {
      this.patchToEnableFixtures(this.global, 'beforeEach');
      this.patchToEnableFixtures(this.global, 'afterEach');

      const describeSkip = this.global.describe.skip;
      this.global.describe.skip = (...args) => {
        if (args.length === 1)
          return args[0] ? describeSkip : this.global.describe;
        return describeSkip(...args);
      };

      function addSlow(f) {
        f.slow = () => {
          return (...args) => f(...args, 90000);
        };
        return f;
      }

      const itSkip = this.global.it.skip;
      addSlow(itSkip);
      addSlow(this.global.it);
      this.global.it.skip = (...args) => {
        if (args.length === 1)
          return args[0] ? itSkip : this.global.it;
        return itSkip(...args);
      };
      if (reportOnly) {
        this.global.it.fail = condition => {
          return addSlow((...inner) => {
            inner[1].__fail = !!condition;
            return this.global.it(...inner);
          });
        };
      } else {
        this.global.it.fail = this.global.it.skip;
      }

      const testOptions = this.global.testOptions;
      function toBeGolden(received, goldenName) {
        const {snapshotState} = this;
        const updateSnapshot = snapshotState._updateSnapshot;
        const expectedPath = path.join(testOptions.GOLDEN_DIR, goldenName);
        const fileExists = fs.existsSync(expectedPath);
        if (updateSnapshot === 'all' || (updateSnapshot === 'new' && !fileExists)) {
          fs.writeFileSync(expectedPath, received);
          if (fileExists)
            snapshotState.updated++;
          else
            snapshotState.added++;
          return {
            pass: true
          }
        };

        const {pass, message} =  GoldenUtils.compare(received, {
          goldenPath: testOptions.GOLDEN_DIR,
          outputPath: testOptions.OUTPUT_DIR,
          goldenName
        });
        if (pass)
          snapshotState.matched++;
        else
          snapshotState.unmatched++;
        return {pass, message: () => message};
      };
      this.global.expect.extend({ toBeGolden });
    }

    if (event.name === 'test_start') {
      const fn = event.test.fn;
      event.test.fn = async () => {
        if (reportOnly) {
          if (fn.__fail)
            throw new Error('fail');
          return;
        }
        debug('pw:test')(`start "${testOrSuiteName(event.test)}"`);
        try {
          await this.fixturePool.resolveParametersAndRun(fn);
        } finally {
          await this.fixturePool.teardownScope('test');
          debug('pw:test')(`finish "${testOrSuiteName(event.test)}"`);
        }
      };
    }

    if (event.name === 'test_fn_failure') {
      await this.fixturePool.teardownScope('worker');
    }
  }
}

class Fixture {
  constructor(pool, name, scope, fn) {
    this.pool = pool;
    this.name = name;
    this.scope = scope;
    this.fn = fn;
    this.deps = fixtureParameterNames(this.fn);
    this.usages = new Set();
    this.value = null;
  }

  async setup() {
    for (const name of this.deps) {
      await this.pool.setupFixture(name);
      this.pool.instances.get(name).usages.add(this.name);
    }

    const params = {};
    for (const n of this.deps)
      params[n] = this.pool.instances.get(n).value;
    let setupFenceFulfill;
    let setupFenceReject;
    const setupFence = new Promise((f, r) => { setupFenceFulfill = f; setupFenceReject = r; });
    const teardownFence = new Promise(f => this._teardownFenceCallback = f);
    debug('pw:test:hook')(`setup "${this.name}"`);
    this._tearDownComplete = this.fn(params, async value => {
      this.value = value;
      setupFenceFulfill();
      await teardownFence;
    }).catch(e => setupFenceReject(e));
    await setupFence;
    this._setup = true;
  }

  async teardown() {
    if (this._teardown)
      return;
    this._teardown = true;
    for (const name of this.usages) {
      const fixture = this.pool.instances.get(name);
      if (!fixture)
        continue;
      await fixture.teardown();
    }
    if (this._setup) {
      debug('pw:test:hook')(`teardown "${this.name}"`);
      this._teardownFenceCallback();
    }
    await this._tearDownComplete;
    this.pool.instances.delete(this.name);
  }
}

class FixturePool {
  constructor() {
    this.registrations = new Map();
    this.instances = new Map();
  }

  registerFixture(name, scope, fn) {
    this.registrations.set(name, { scope, fn });
  }

  async setupFixture(name) {
    let fixture = this.instances.get(name);
    if (fixture)
      return fixture;

    if (!this.registrations.has(name))
      throw new Error('Unknown fixture: ' + name);
    const { scope, fn } = this.registrations.get(name);
    fixture = new Fixture(this, name, scope, fn);
    this.instances.set(name, fixture);
    await fixture.setup();
    return fixture;
  }

  async teardownScope(scope) {
    for (const [name, fixture] of this.instances) {
      if (fixture.scope === scope)
        await fixture.teardown();
    }
  }

  async resolveParametersAndRun(fn) {
    const names = fixtureParameterNames(fn);
    for (const name of names)
      await this.setupFixture(name);
    const params = {};
    for (const n of names)
      params[n] = this.instances.get(n).value;
    return fn(params);
  }
}

exports.getPlaywrightEnv = () => PlaywrightEnvironment;
exports.default = exports.getPlaywrightEnv();

function fixtureParameterNames(fn) {
  const text = fn.toString();
  const match = text.match(/async(?:\s+function)?\s*\(\s*{\s*([^}]*)\s*}/);
  if (!match || !match[1].trim())
    return [];
  let signature = match[1];
  return signature.split(',').map(t => t.trim());
}

function valueFromEnv(name, defaultValue) {
  if (!(name in process.env))
    return defaultValue;
  return JSON.parse(process.env[name]);
}

function testOrSuiteName(o) {
  if (o.name === 'ROOT_DESCRIBE_BLOCK')
    return '';
  let name = o.parent ? testOrSuiteName(o.parent) : '';
  if (name && o.name)
    name += ' ';
  return name + o.name;
}
