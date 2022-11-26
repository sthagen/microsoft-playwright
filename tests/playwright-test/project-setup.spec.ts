/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { PlaywrightTestConfig, TestInfo, PlaywrightTestProject } from '@playwright/test';
import path from 'path';
import { test, expect } from './playwright-test-fixtures';

function createConfigWithProjects(names: string[], testInfo: TestInfo, projectTemplates?: { [name: string]: PlaywrightTestProject }): Record<string, string> {
  const config: PlaywrightTestConfig = {
    projects: names.map(name => ({ ...projectTemplates?.[name], name, testDir: testInfo.outputPath(name) })),
  };
  const files = {};
  for (const name of names) {
    files[`${name}/${name}.spec.ts`] = `
       const { test } = pwt;
       test('${name} test', async () => {
         await new Promise(f => setTimeout(f, 100));
       });`;
    files[`${name}/${name}.setup.ts`] = `
       const { test } = pwt;
       test('${name} setup', async () => {
         await new Promise(f => setTimeout(f, 100));
       });`;
  }
  function replacer(key, value) {
    if (value instanceof RegExp)
      return `RegExp(${value.toString()})`;
    else
      return value;
  }
  files['playwright.config.ts'] = `
     import * as path from 'path';
     module.exports = ${JSON.stringify(config, replacer, 2)};
     `.replace(/"RegExp\((.*)\)"/g, '$1');
  return files;
}

type Timeline = { titlePath: string[], event: 'begin' | 'end' }[];

function formatTimeline(timeline: Timeline) {
  return timeline.map(e => `${e.titlePath.slice(1).join(' > ')} [${e.event}]`).join('\n');
}

function formatFileNames(timeline: Timeline) {
  return timeline.map(e => e.titlePath[2]).join('\n');
}

function fileNames(timeline: Timeline) {
  const fileNames = Array.from(new Set(timeline.map(({ titlePath }) => {
    const name = titlePath[2];
    const index = name.lastIndexOf(path.sep);
    if (index === -1)
      return name;
    return name.slice(index + 1);
  })).keys());
  fileNames.sort();
  return fileNames;
}

function expectFilesRunBefore(timeline: Timeline, before: string[], after: string[]) {
  const fileBegin = name => {
    const index = timeline.findIndex(({ titlePath }) => titlePath[2] === name);
    expect(index, `cannot find ${name} in\n${formatFileNames(timeline)}`).not.toBe(-1);
    return index;
  };
  const fileEnd = name => {
    // There is no Array.findLastIndex in Node < 18.
    let index = -1;
    for (index = timeline.length - 1; index >= 0; index--) {
      if (timeline[index].titlePath[2] === name)
        break;
    }
    expect(index, `cannot find ${name} in\n${formatFileNames(timeline)}`).not.toBe(-1);
    return index;
  };

  for (const b of before) {
    const bEnd = fileEnd(b);
    for (const a of after) {
      const aBegin = fileBegin(a);
      expect(bEnd < aBegin, `'${b}' expected to finish before ${a}, actual order:\n${formatTimeline(timeline)}`).toBeTruthy();
    }
  }
}

test('should work for one project', async ({ runGroups }, testInfo) => {
  const projectTemplates = {
    'a': {
      setup: ['**/*.setup.ts']
    },
  };
  const configWithFiles = createConfigWithProjects(['a'], testInfo, projectTemplates);
  const { exitCode, passed, timeline } = await runGroups(configWithFiles);
  expect(exitCode).toBe(0);
  expect(passed).toBe(2);
  expect(formatTimeline(timeline)).toEqual(`a > a${path.sep}a.setup.ts > a setup [begin]
a > a${path.sep}a.setup.ts > a setup [end]
a > a${path.sep}a.spec.ts > a test [begin]
a > a${path.sep}a.spec.ts > a test [end]`);
});

test('should work for several projects', async ({ runGroups }, testInfo) => {
  const projectTemplates = {
    'a': {
      setup: ['**/*.setup.ts']
    },
    'b': {
      setup: /.*b.setup.ts/
    },
    'c': {
      setup: '**/c.setup.ts'
    },
  };
  const configWithFiles = createConfigWithProjects(['a', 'b', 'c'], testInfo, projectTemplates);
  const { exitCode, passed, timeline } = await runGroups(configWithFiles);
  expect(exitCode).toBe(0);
  expect(passed).toBe(6);
  for (const name of ['a', 'b', 'c'])
    expectFilesRunBefore(timeline, [`${name}${path.sep}${name}.setup.ts`], [`${name}${path.sep}${name}.spec.ts`]);
});

test('should stop project if setup fails', async ({ runGroups }, testInfo) => {
  const projectTemplates = {
    'a': {
      setup: ['**/*.setup.ts']
    },
    'b': {
      setup: /.*b.setup.ts/
    },
  };
  const configWithFiles = createConfigWithProjects(['a', 'b', 'c'], testInfo, projectTemplates);
  configWithFiles[`a/a.setup.ts`] = `
  const { test, expect } = pwt;
  test('a setup', async () => {
    expect(1).toBe(2);
  });`;

  const { exitCode, passed, skipped, timeline } = await runGroups(configWithFiles);
  expect(exitCode).toBe(1);
  expect(passed).toBe(3);
  expect(skipped).toBe(1); // 1 test from project 'a'
  for (const name of ['a', 'b'])
    expectFilesRunBefore(timeline, [`${name}${path.sep}${name}.setup.ts`], [`${name}${path.sep}${name}.spec.ts`]);
});

test('should run setup in each project shard', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
      test('test4', async () => { });
    `,
    'b.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
    `,
    'c.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
      test('setup2', async () => { });
    `,
  };

  { // Shard 1/2
    const { exitCode, passed, timeline, output } =  await runGroups(files, { shard: '1/2' });
    expect(output).toContain('Running 6 tests using 1 worker, shard 1 of 2');
    expect(fileNames(timeline)).toEqual(['a.test.ts', 'c.setup.ts']);
    expectFilesRunBefore(timeline, [`c.setup.ts`], [`a.test.ts`]);
    expect(exitCode).toBe(0);
    expect(passed).toBe(6);
  }
  { // Shard 2/2
    const { exitCode, passed, timeline, output } =  await runGroups(files, { shard: '2/2' });
    expect(output).toContain('Running 4 tests using 1 worker, shard 2 of 2');
    expect(fileNames(timeline)).toEqual(['b.test.ts', 'c.setup.ts']);
    expectFilesRunBefore(timeline, [`c.setup.ts`], [`b.test.ts`]);
    expect(exitCode).toBe(0);
    expect(passed).toBe(4);
  }
});

test('should run setup only for projects that have tests in the shard', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*p1.setup.ts$/,
            testMatch: /.*a.test.ts/,
          },
          {
            name: 'p2',
            setup: /.*p2.setup.ts$/,
            testMatch: /.*b.test.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
      test('test4', async () => { });
    `,
    'b.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
    `,
    'p1.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
      test('setup2', async () => { });
    `,
    'p2.setup.ts': `
      const { test } = pwt;
      test('setup3', async () => { });
      test('setup4', async () => { });
    `,
  };

  { // Shard 1/2
    const { exitCode, passed, timeline, output } =  await runGroups(files, { shard: '1/2' });
    expect(output).toContain('Running 6 tests using 1 worker, shard 1 of 2');
    expect(fileNames(timeline)).toEqual(['a.test.ts', 'p1.setup.ts']);
    expectFilesRunBefore(timeline, [`p1.setup.ts`], [`a.test.ts`]);
    expect(exitCode).toBe(0);
    expect(passed).toBe(6);
  }
  { // Shard 2/2
    const { exitCode, passed, timeline, output } =  await runGroups(files, { shard: '2/2' });
    expect(output).toContain('Running 4 tests using 1 worker, shard 2 of 2');
    expect(fileNames(timeline)).toEqual(['b.test.ts', 'p2.setup.ts']);
    expectFilesRunBefore(timeline, [`p2.setup.ts`], [`b.test.ts`]);
    expect(exitCode).toBe(0);
    expect(passed).toBe(4);
  }
});

test('--project only runs setup from that project;', async ({ runGroups }, testInfo) => {
  const projectTemplates = {
    'a': {
      setup: /.*a.setup.ts/
    },
    'b': {
      setup: /.*b.setup.ts/
    },
  };
  const configWithFiles = createConfigWithProjects(['a', 'b', 'c'], testInfo, projectTemplates);
  const { exitCode, passed, timeline } = await runGroups(configWithFiles, { project: ['a', 'c'] });
  expect(exitCode).toBe(0);
  expect(passed).toBe(3);
  expect(fileNames(timeline)).toEqual(['a.setup.ts', 'a.spec.ts', 'c.spec.ts']);
});

test('same file cannot be a setup and a test in the same project', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*a.test.ts$/,
            testMatch: /.*a.test.ts$/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
    `,
  };

  const { exitCode, output } =  await runGroups(files);
  expect(exitCode).toBe(1);
  expect(output).toContain(`a.test.ts" matches both 'setup' and 'testMatch' filters in project "p1"`);
});

test('same file cannot be a setup and a test in different projects', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*a.test.ts$/,
            testMatch: /.*noMatch.test.ts$/,
          },
          {
            name: 'p2',
            setup: /.*noMatch.test.ts$/,
            testMatch: /.*a.test.ts$/
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
    `,
  };

  const { exitCode, output } =  await runGroups(files);
  expect(exitCode).toBe(1);
  expect(output).toContain(`a.test.ts" matches 'setup' filter in project "p1" and 'testMatch' filter in project "p2"`);
});

test('list-files should enumerate setup files in same group', async ({ runCommand }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*a..setup.ts$/,
            testMatch: /.*a.test.ts$/,
          },
          {
            name: 'p2',
            setup: /.*b.setup.ts$/,
            testMatch: /.*b.test.ts$/
          },
        ]
      };`,
    'a1.setup.ts': `
      const { test } = pwt;
      test('test1', async () => { });
    `,
    'a2.setup.ts': `
      const { test } = pwt;
      test('test1', async () => { });
    `,
    'a.test.ts': `
      const { test } = pwt;
      test('test2', async () => { });
    `,
    'b.setup.ts': `
      const { test } = pwt;
      test('test3', async () => { });
    `,
    'b.test.ts': `
      const { test } = pwt;
      test('test4', async () => { });
    `,
  };

  const { exitCode, output } =  await runCommand(files, ['list-files']);
  expect(exitCode).toBe(0);
  const json = JSON.parse(output);
  expect(json.projects.map(p => p.name)).toEqual(['p1', 'p2']);
  expect(json.projects[0].files.map(f => path.basename(f))).toEqual(['a.test.ts', 'a1.setup.ts', 'a2.setup.ts']);
  expect(json.projects[1].files.map(f => path.basename(f))).toEqual(['b.setup.ts', 'b.test.ts']);
});

test('test --list should enumerate setup tests as regular ones', async ({ runCommand }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*a..setup.ts$/,
            testMatch: /.*a.test.ts$/,
          },
          {
            name: 'p2',
            setup: /.*b.setup.ts$/,
            testMatch: /.*b.test.ts$/
          },
        ]
      };`,
    'a1.setup.ts': `
      const { test } = pwt;
      test('test1', async () => { });
    `,
    'a2.setup.ts': `
      const { test } = pwt;
      test('test1', async () => { });
    `,
    'a.test.ts': `
      const { test } = pwt;
      test('test2', async () => { });
    `,
    'b.setup.ts': `
      const { test } = pwt;
      test('test3', async () => { });
    `,
    'b.test.ts': `
      const { test } = pwt;
      test('test4', async () => { });
    `,
  };

  const { exitCode, output } =  await runCommand(files, ['test', '--list']);
  expect(exitCode).toBe(0);
  expect(output).toContain(`Listing tests:
  [p1] › a.test.ts:6:7 › test2
  [p1] › a1.setup.ts:5:7 › test1
  [p1] › a2.setup.ts:5:7 › test1
  [p2] › b.setup.ts:5:7 › test3
  [p2] › b.test.ts:6:7 › test4
Total: 5 tests in 5 files`);
});

test('should allow .only in setup files', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
      test('test4', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test.only('setup1', async () => { });
      test('setup2', async () => { });
      test.only('setup3', async () => { });
    `,
  };

  const { exitCode, passed, timeline, output } =  await runGroups(files);
  expect(output).toContain('Running 2 tests using 1 worker');
  expect(output).toContain('[p1] › a.setup.ts:5:12 › setup1');
  expect(output).toContain('[p1] › a.setup.ts:7:12 › setup3');
  expect(fileNames(timeline)).toEqual(['a.setup.ts']);
  expect(exitCode).toBe(0);
  expect(passed).toBe(2);
});

test('should allow describe.only in setup files', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
      test('test4', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test.describe.only('main', () => {
        test('setup1', async () => { });
        test('setup2', async () => { });
      });
      test('setup3', async () => { });
    `,
  };

  const { exitCode, passed, timeline, output } =  await runGroups(files);
  expect(output).toContain('Running 2 tests using 1 worker');
  expect(output).toContain('[p1] › a.setup.ts:6:9 › main › setup1');
  expect(output).toContain('[p1] › a.setup.ts:7:9 › main › setup2');
  expect(fileNames(timeline)).toEqual(['a.setup.ts']);
  expect(exitCode).toBe(0);
  expect(passed).toBe(2);
});

test('should filter describe line in setup files', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
      test('test4', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test.describe('main', () => {
        test('setup1', async () => { });
        test('setup2', async () => { });
      });
      test('setup3', async () => { });
    `,
  };

  const { exitCode, passed, timeline, output } =  await runGroups(files, undefined, undefined, { additionalArgs: ['a.setup.ts:5'] });
  expect(output).toContain('Running 2 tests using 1 worker');
  expect(output).toContain('[p1] › a.setup.ts:6:9 › main › setup1');
  expect(output).toContain('[p1] › a.setup.ts:7:9 › main › setup2');
  expect(fileNames(timeline)).toEqual(['a.setup.ts']);
  expect(exitCode).toBe(0);
  expect(passed).toBe(2);
});

test('should allow .only in both setup and test files', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test.only('test2', async () => { });
      test('test3', async () => { });
      test('test4', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test.only('setup1', async () => { });
      test('setup2', async () => { });
      test('setup3', async () => { });
    `,
  };

  const { exitCode, output } =  await runGroups(files);
  expect(exitCode).toBe(0);
  expect(output).toContain('[p1] › a.setup.ts:5:12 › setup1');
  expect(output).toContain('[p1] › a.test.ts:7:12 › test2');
});

test('should run full setup when there is test.only', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test.only('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
      test('test4', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
      test('setup2', async () => { });
    `,
    'b.setup.ts': `
      const { test } = pwt;
      test('setup3', async () => { });
    `,
  };

  const { exitCode, passed, output } =  await runGroups(files);
  expect(exitCode).toBe(0);
  expect(passed).toBe(4);
  expect(output).toContain('Running 4 tests using 2 workers');
  expect(output).toContain('[p1] › b.setup.ts:5:7 › setup3');
  expect(output).toContain('[p1] › a.setup.ts:5:7 › setup1');
  expect(output).toContain('[p1] › a.setup.ts:6:7 › setup2');
  expect(output).toContain('[p1] › a.test.ts:6:12 › test1');
});

test('should allow filtering setup by file:line', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*a.setup.ts/,
          },
          {
            name: 'p2',
            setup: /.*b.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
      test('setup2', async () => { });
    `,
    'b.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
    `,
    'b.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
    `,
  };

  {
    const { exitCode, passed, output } =  await runGroups(files, undefined, undefined, { additionalArgs: ['.*setup.ts$'] });
    expect(output).toContain('Running 3 tests using 2 workers');
    expect(output).toContain('[p1] › a.setup.ts:5:7 › setup1');
    expect(output).toContain('[p1] › a.setup.ts:6:7 › setup2');
    expect(output).toContain('[p2] › b.setup.ts:5:7 › setup1');
    expect(exitCode).toBe(0);
    expect(passed).toBe(3);
  }
  {
    const { exitCode, passed, output } =  await runGroups(files, undefined, undefined, { additionalArgs: ['.*a.setup.ts:5'] });
    expect(output).toContain('Running 1 test using 1 worker');
    expect(output).toContain('[p1] › a.setup.ts:5:7 › setup1');
    expect(exitCode).toBe(0);
    expect(passed).toBe(1);
  }
});

test('should support filters matching both setup and test', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
      test('setup2', async () => { });
    `,
    'b.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
    `,
    'b.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
    `,
  };

  const { exitCode, output } =  await runGroups(files, undefined, undefined, { additionalArgs: ['.*a.(setup|test).ts$'] });
  expect(exitCode).toBe(0);
  expect(output).toContain('Running 5 tests using 1 worker');
  expect(output).toContain('[p1] › a.setup.ts:5:7 › setup1');
  expect(output).toContain('[p1] › a.setup.ts:6:7 › setup2');
  expect(output).toContain('[p1] › a.test.ts:6:7 › test1');
  expect(output).toContain('[p1] › a.test.ts:7:7 › test2');
  expect(output).toContain('[p1] › a.test.ts:8:7 › test3');
});

test('should run setup for a project if tests match only in another project', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            testMatch: /.*a.test.ts/,
            setup: /.*a.setup.ts/,
          },
          {
            name: 'p2',
            testMatch: /.*b.test.ts/,
            setup: /.*b.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
    `,
    'b.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
    `,
    'b.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
    `,
  };

  const { exitCode, output } =  await runGroups(files, undefined, undefined, { additionalArgs: ['.*a.test.ts$'] });
  expect(exitCode).toBe(0);
  expect(output).toContain('Running 3 tests using 2 workers');
  expect(output).toContain('[p1] › a.setup.ts:5:7 › setup1');
  expect(output).toContain('[p1] › a.test.ts:6:7 › test1');
  expect(output).toContain('[p2] › b.setup.ts:5:7 › setup1');
});

test('should run all setup files if only tests match filter', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
      test('setup2', async () => { });
    `,
    'b.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
    `,
  };

  const { exitCode, output } =  await runGroups(files, undefined, undefined, { additionalArgs: ['a.test.ts:7'] });
  expect(exitCode).toBe(0);
  expect(output).toContain('Running 4 tests using 2 workers');
  expect(output).toContain('[p1] › a.setup.ts:5:7 › setup1');
  expect(output).toContain('[p1] › a.setup.ts:6:7 › setup2');
  expect(output).toContain('[p1] › b.setup.ts:5:7 › setup1');
  expect(output).toContain('[p1] › a.test.ts:7:7 › test2');
});

test('should run all setup files if only tests match grep filter', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('test3', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
      test('setup2', async () => { });
    `,
    'b.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
    `,
  };

  const { exitCode, output } =  await runGroups(files, undefined, undefined, { additionalArgs: ['--grep', '.*test2$'] });
  expect(exitCode).toBe(0);
  expect(output).toContain('Running 4 tests using 2 workers');
  expect(output).toContain('[p1] › a.setup.ts:5:7 › setup1');
  expect(output).toContain('[p1] › a.setup.ts:6:7 › setup2');
  expect(output).toContain('[p1] › b.setup.ts:5:7 › setup1');
  expect(output).toContain('[p1] › a.test.ts:7:7 › test2');
});

test('should apply project.grep filter to both setup and tests', async ({ runGroups }, testInfo) => {
  const files = {
    'playwright.config.ts': `
      module.exports = {
        projects: [
          {
            name: 'p1',
            setup: /.*.setup.ts/,
            grep: /a.(test|setup).ts.*(test|setup)/,
          },
        ]
      };`,
    'a.test.ts': `
      const { test } = pwt;
      test('test1', async () => { });
      test('test2', async () => { });
      test('foo', async () => { });
    `,
    'a.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
      test('setup2', async () => { });
    `,
    'b.setup.ts': `
      const { test } = pwt;
      test('setup1', async () => { });
      test('foo', async () => { });
    `,
  };

  const { exitCode, output } =  await runGroups(files);
  expect(exitCode).toBe(0);
  expect(output).toContain('[p1] › a.setup.ts:5:7 › setup1');
  expect(output).toContain('[p1] › a.setup.ts:6:7 › setup2');
  expect(output).toContain('[p1] › a.test.ts:6:7 › test1');
  expect(output).toContain('[p1] › a.test.ts:7:7 › test2');
});
