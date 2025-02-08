#!/usr/bin/env node
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

// @ts-check

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('yaml');

const channels = new Map();
const mixins = new Map();

function raise(item) {
  throw new Error('Invalid item: ' + JSON.stringify(item, null, 2));
}

function titleCase(name) {
  return name[0].toUpperCase() + name.substring(1);
}

function inlineType(type, indent, wrapEnums = false) {
  if (typeof type === 'string') {
    const optional = type.endsWith('?');
    if (optional)
      type = type.substring(0, type.length - 1);
    if (type === 'binary')
      return { ts: 'Binary', scheme: 'tBinary', optional };
    if (type === 'json')
      return { ts: 'any', scheme: 'tAny', optional };
    if (['string', 'boolean', 'number', 'undefined'].includes(type))
      return { ts: type, scheme: `t${titleCase(type)}`, optional };
    if (channels.has(type)) {
      let derived = derivedClasses.get(type) || [];
      derived = [...derived, type];
      return { ts: `${type}Channel`, scheme: `tChannel([${derived.map(c => `'${c}'`).join(', ')}])` , optional };
    }
    if (type === 'Channel')
      return { ts: `Channel`, scheme: `tChannel('*')`, optional };
    return { ts: type, scheme: `tType('${type}')`, optional };
  }
  if (type.type.startsWith('array')) {
    const optional = type.type.endsWith('?');
    const inner = inlineType(type.items, indent, true);
    return { ts: `${inner.ts}[]`, scheme: `tArray(${inner.scheme})`, optional };
  }
  if (type.type.startsWith('enum')) {
    const optional = type.type.endsWith('?');
    const ts = type.literals.map(literal => `'${literal}'`).join(' | ');
    return {
      ts: wrapEnums ? `(${ts})` : ts,
      scheme: `tEnum([${type.literals.map(literal => `'${literal}'`).join(', ')}])`,
      optional
    };
  }
  if (type.type.startsWith('object')) {
    const optional = type.type.endsWith('?');
    const inner = properties(type.properties, indent + '  ');
    return {
      ts: `{\n${inner.ts}\n${indent}}`,
      scheme: `tObject({\n${inner.scheme}\n${indent}})`,
      optional
    };
  }
  raise(type);
}

function properties(properties, indent, onlyOptional) {
  const ts = [];
  const scheme = [];
  const visitProperties = props => {
    for (const [name, value] of Object.entries(props)) {
      if (name.startsWith('$mixin')) {
        visitProperties(mixins.get(value).properties);
        continue;
      }
      const inner = inlineType(value, indent);
      if (onlyOptional && !inner.optional)
        continue;
      ts.push(`${indent}${name}${inner.optional ? '?' : ''}: ${inner.ts},`);
      const wrapped = inner.optional ? `tOptional(${inner.scheme})` : inner.scheme;
      scheme.push(`${indent}${name}: ${wrapped},`);
    }
  };
  visitProperties(properties);
  return { ts: ts.join('\n'), scheme: scheme.join('\n') };
}

function objectType(props, indent, onlyOptional = false) {
  if (!Object.entries(props).length)
    return { ts: `{}`, scheme: `tObject({})` };
  const inner = properties(props, indent + '  ', onlyOptional);
  return { ts: `{\n${inner.ts}\n${indent}}`, scheme: `tObject({\n${inner.scheme}\n${indent}})` };
}

const channels_ts = [
`/**
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

// This file is generated by ${path.basename(__filename).split(path.sep).join(path.posix.sep)}, do not edit manually.

import type { CallMetadata } from './callMetadata';

export type Binary = Buffer;

export interface Channel {
}
`];

const validator_ts = [
`/**
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

// This file is generated by ${path.basename(__filename)}, do not edit manually.

/* eslint-disable import/order */
import { scheme, tOptional, tObject, tBoolean, tNumber, tString, tAny, tEnum, tArray, tBinary, tChannel, tType } from './validatorPrimitives';
export type { Validator, ValidatorContext } from './validatorPrimitives';
export { ValidationError, findValidator, maybeFindValidator, createMetadataValidator } from './validatorPrimitives';
`];

const debug_ts = [
`/**
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

// This file is generated by ${path.basename(__filename).split(path.sep).join(path.posix.sep)}, do not edit manually.
`];

const slowMoActions = [];
const tracingSnapshots = [];
const pausesBeforeInputActions = [];

const yml = fs.readFileSync(path.join(__dirname, '..', 'packages', 'protocol', 'src', 'protocol.yml'), 'utf-8');
const protocol = yaml.parse(yml);

function addScheme(name, s) {
  validator_ts.push(`scheme.${name} = ${s};`);
}

for (const [name, value] of Object.entries(protocol)) {
  if (value.type === 'interface')
    channels.set(name, value);
  if (value.type === 'mixin')
    mixins.set(name, value);
}

const derivedClasses = new Map();
for (const [name, item] of Object.entries(protocol)) {
  if (item.type === 'interface' && item.extends) {
    let items = derivedClasses.get(item.extends);
    if (!items) {
      items = [];
      derivedClasses.set(item.extends, items);
    }
    items.push(name);
  }
}

channels_ts.push(`// ----------- Initializer Traits -----------`);
channels_ts.push(`export type InitializerTraits<T> =`);
const entriesInReverse = Object.entries(protocol).reverse();
for (const [name, item] of entriesInReverse) {
  if (item.type !== 'interface')
    continue;
  channels_ts.push(`    T extends ${name}Channel ? ${name}Initializer :`);
}
channels_ts.push(`    object;`);
channels_ts.push(``);
channels_ts.push(`// ----------- Event Traits -----------`);
channels_ts.push(`export type EventsTraits<T> =`);
for (const [name, item] of entriesInReverse) {
  if (item.type !== 'interface')
    continue;
  channels_ts.push(`    T extends ${name}Channel ? ${name}Events :`);
}
channels_ts.push(`    undefined;`);
channels_ts.push(``);
channels_ts.push(`// ----------- EventTarget Traits -----------`);
channels_ts.push(`export type EventTargetTraits<T> =`);
for (const [name, item] of entriesInReverse) {
  if (item.type !== 'interface')
    continue;
  channels_ts.push(`    T extends ${name}Channel ? ${name}EventTarget :`);
}
channels_ts.push(`    undefined;`);
channels_ts.push(``);

for (const [name, item] of Object.entries(protocol)) {
  if (item.type === 'interface') {
    const channelName = name;
    channels_ts.push(`// ----------- ${channelName} -----------`);
    const init = objectType(item.initializer || {}, '');
    const initializerName = channelName + 'Initializer';
    channels_ts.push(`export type ${initializerName} = ${init.ts};`);

    let ancestorInit = init;
    let ancestor = item;
    while (!ancestor.initializer) {
      if (!ancestor.extends)
        break;
      ancestor = channels.get(ancestor.extends);
      ancestorInit = objectType(ancestor.initializer || {}, '');
    }
    addScheme(`${channelName}Initializer`, ancestor.initializer ? ancestorInit.scheme : `tOptional(tObject({}))`);

    channels_ts.push(`export interface ${channelName}EventTarget {`);
    const ts_types = new Map();

    /** @type{{eventName: string, eventType: string}[]} */
    const eventTypes = [];
    for (let [eventName, event] of Object.entries(item.events || {})) {
      if (event === null)
        event = {};
      const parameters = objectType(event.parameters || {}, '');
      const paramsName = `${channelName}${titleCase(eventName)}Event`;
      ts_types.set(paramsName, parameters.ts);
      channels_ts.push(`  on(event: '${eventName}', callback: (params: ${paramsName}) => void): this;`);
      eventTypes.push({eventName, eventType: paramsName});
      addScheme(paramsName, event.parameters ? parameters.scheme : `tOptional(tObject({}))`);
      for (const derived of derivedClasses.get(channelName) || [])
        addScheme(`${derived}${titleCase(eventName)}Event`, `tType('${paramsName}')`);
    }
    channels_ts.push(`}`);

    channels_ts.push(`export interface ${channelName}Channel extends ${channelName}EventTarget, ${(item.extends || '') + 'Channel'} {`);
    channels_ts.push(`  _type_${channelName}: boolean;`);
    for (let [methodName, method] of Object.entries(item.commands || {})) {
      if (method === null)
        method = {};
      if (method.flags?.slowMo) {
        slowMoActions.push(name + '.' + methodName);
        for (const derived of derivedClasses.get(name) || [])
          slowMoActions.push(derived + '.' + methodName);
      }
      if (method.flags?.snapshot) {
        tracingSnapshots.push(name + '.' + methodName);
        for (const derived of derivedClasses.get(name) || [])
          tracingSnapshots.push(derived + '.' + methodName);
      }
      if (method.flags?.pausesBeforeInput) {
        pausesBeforeInputActions.push(name + '.' + methodName);
        for (const derived of derivedClasses.get(name) || [])
          pausesBeforeInputActions.push(derived + '.' + methodName);
      }
      const parameters = objectType(method.parameters || {}, '');
      const paramsName = `${channelName}${titleCase(methodName)}Params`;
      const optionsName = `${channelName}${titleCase(methodName)}Options`;
      ts_types.set(paramsName, parameters.ts);
      ts_types.set(optionsName, objectType(method.parameters || {}, '', true).ts);
      addScheme(paramsName, method.parameters ? parameters.scheme : `tOptional(tObject({}))`);
      for (const derived of derivedClasses.get(channelName) || [])
        addScheme(`${derived}${titleCase(methodName)}Params`, `tType('${paramsName}')`);

      const resultName = `${channelName}${titleCase(methodName)}Result`;
      const returns = objectType(method.returns || {}, '');
      ts_types.set(resultName, method.returns ? returns.ts : 'void');
      addScheme(resultName, method.returns ? returns.scheme : `tOptional(tObject({}))`);
      for (const derived of derivedClasses.get(channelName) || [])
        addScheme(`${derived}${titleCase(methodName)}Result`, `tType('${resultName}')`);

      channels_ts.push(`  ${methodName}(params${method.parameters ? '' : '?'}: ${paramsName}, metadata?: CallMetadata): Promise<${resultName}>;`);
    }

    channels_ts.push(`}`);
    for (const [typeName, typeValue] of ts_types)
      channels_ts.push(`export type ${typeName} = ${typeValue};`);
    channels_ts.push(``);

    channels_ts.push(`export interface ${channelName}Events {`);
    for (const {eventName, eventType} of eventTypes)
        channels_ts.push(`  '${eventName}': ${eventType};`);
    channels_ts.push(`}\n`);

  } else if (item.type === 'object') {
    const inner = objectType(item.properties, '');
    channels_ts.push(`export type ${name} = ${inner.ts};`);
    channels_ts.push(``);
    addScheme(name, inner.scheme);
  } else if (item.type === 'enum') {
    const ts = item.literals.map(literal => `'${literal}'`).join(' | ');
    channels_ts.push(`export type ${name} = ${ts};`)
    addScheme(name, `tEnum([${item.literals.map(literal => `'${literal}'`).join(', ')}])`);
  }
}

debug_ts.push(`export const slowMoActions = new Set([
  '${slowMoActions.join(`',\n  '`)}'
]);`);
debug_ts.push('');
debug_ts.push(`export const commandsWithTracingSnapshots = new Set([
  '${tracingSnapshots.join(`',\n  '`)}'
]);`);
debug_ts.push('');
debug_ts.push(`export const pausesBeforeInputActions = new Set([
  '${pausesBeforeInputActions.join(`',\n  '`)}'
]);`);

let hasChanges = false;

function writeFile(filePath, content) {
  try {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content)
      return;
  } catch (e) {
  }
  hasChanges = true;
  const root = path.join(__dirname, '..');
  console.log(`Writing //${path.relative(root, filePath)}`);
  fs.writeFileSync(filePath, content, 'utf8');
}

writeFile(path.join(__dirname, '..', 'packages', 'protocol', 'src', 'channels.d.ts'), channels_ts.join('\n') + '\n');
writeFile(path.join(__dirname, '..', 'packages', 'playwright-core', 'src', 'protocol', 'debug.ts'), debug_ts.join('\n') + '\n');
writeFile(path.join(__dirname, '..', 'packages', 'playwright-core', 'src', 'protocol', 'validator.ts'), validator_ts.join('\n') + '\n');
process.exit(hasChanges ? 1 : 0);
