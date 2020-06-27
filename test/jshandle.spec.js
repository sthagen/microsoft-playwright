/**
 * Copyright 2018 Google Inc. All rights reserved.
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

const {FFOX, CHROMIUM, WEBKIT} = require('./utils').testOptions(browserType);

describe('Page.evaluateHandle', function() {
  it('should work', async({page, server}) => {
    const windowHandle = await page.evaluateHandle(() => window);
    expect(windowHandle).toBeTruthy();
  });
  it('should accept object handle as an argument', async({page, server}) => {
    const navigatorHandle = await page.evaluateHandle(() => navigator);
    const text = await page.evaluate(e => e.userAgent, navigatorHandle);
    expect(text).toContain('Mozilla');
  });
  it('should accept object handle to primitive types', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => 5);
    const isFive = await page.evaluate(e => Object.is(e, 5), aHandle);
    expect(isFive).toBeTruthy();
  });
  it('should accept nested handle', async({page, server}) => {
    const foo = await page.evaluateHandle(() => ({ x: 1, y: 'foo' }));
    const result = await page.evaluate(({ foo }) => {
      return foo;
    }, { foo });
    expect(result).toEqual({ x: 1, y: 'foo' });
  });
  it('should accept nested window handle', async({page, server}) => {
    const foo = await page.evaluateHandle(() => window);
    const result = await page.evaluate(({ foo }) => {
      return foo === window;
    }, { foo });
    expect(result).toBe(true);
  });
  it('should accept multiple nested handles', async({page, server}) => {
    const foo = await page.evaluateHandle(() => ({ x: 1, y: 'foo' }));
    const bar = await page.evaluateHandle(() => 5);
    const baz = await page.evaluateHandle(() => (['baz']));
    const result = await page.evaluate(x => {
      return JSON.stringify(x);
    }, { a1: { foo }, a2: { bar, arr: [{ baz }] } });
    expect(JSON.parse(result)).toEqual({
      a1: { foo: { x: 1, y: 'foo' } },
      a2: { bar: 5, arr: [{ baz: ['baz'] }] }
    });
  });
  it('should throw for circular objects', async({page, server}) => {
    const a = { x: 1 };
    a.y = a;
    const error = await page.evaluate(x => x, a).catch(e => e);
    expect(error.message).toBe('Argument is a circular structure');
  });
  it('should accept same handle multiple times', async({page, server}) => {
    const foo = await page.evaluateHandle(() => 1);
    expect(await page.evaluate(x => x, { foo, bar: [foo], baz: { foo }})).toEqual({ foo: 1, bar: [1], baz: { foo: 1 } });
  });
  it('should accept same nested object multiple times', async({page, server}) => {
    const foo = { x: 1 };
    expect(await page.evaluate(x => x, { foo, bar: [foo], baz: { foo }})).toEqual({ foo: { x: 1 }, bar: [{ x : 1 }], baz: { foo: { x : 1 } } });
  });
  it('should accept object handle to unserializable value', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => Infinity);
    expect(await page.evaluate(e => Object.is(e, Infinity), aHandle)).toBe(true);
  });
  it('should pass configurable args', async({page, server}) => {
    const result = await page.evaluate(arg => {
      if (arg.foo !== 42)
        throw new Error('Not a 42');
      arg.foo = 17;
      if (arg.foo !== 17)
        throw new Error('Not 17');
      delete arg.foo;
      if (arg.foo === 17)
        throw new Error('Still 17');
      return arg;
    }, { foo: 42 });
    expect(result).toEqual({});
  });
  it('should use the same JS wrappers', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => {
      window.FOO = 123;
      return window;
    });
    expect(await page.evaluate(e => e.FOO, aHandle)).toBe(123);
  });
  it('should work with primitives', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => {
      window.FOO = 123;
      return window;
    });
    expect(await page.evaluate(e => e.FOO, aHandle)).toBe(123);
  });
});

describe('JSHandle.getProperty', function() {
  it('should work', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => ({
      one: 1,
      two: 2,
      three: 3
    }));
    const twoHandle = await aHandle.getProperty('two');
    expect(await twoHandle.jsonValue()).toEqual(2);
  });
  it('should work with undefined, null, and empty', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => ({
      undefined: undefined,
      null: null,
    }));
    const undefinedHandle = await aHandle.getProperty('undefined');
    expect(String(await undefinedHandle.jsonValue())).toEqual('undefined');
    const nullHandle = await aHandle.getProperty('null');
    expect(await nullHandle.jsonValue()).toEqual(null);
    const emptyhandle = await aHandle.getProperty('empty');
    expect(String(await emptyhandle.jsonValue())).toEqual('undefined');
  });
  it('should work with unserializable values', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => ({
      infinity: Infinity,
      nInfinity: -Infinity,
      nan: NaN,
      nzero: -0
    }));
    const infinityHandle = await aHandle.getProperty('infinity');
    expect(await infinityHandle.jsonValue()).toEqual(Infinity);
    const nInfinityHandle = await aHandle.getProperty('nInfinity');
    expect(await nInfinityHandle.jsonValue()).toEqual(-Infinity);
    const nanHandle = await aHandle.getProperty('nan');
    expect(String(await nanHandle.jsonValue())).toEqual('NaN');
    const nzeroHandle = await aHandle.getProperty('nzero');
    expect(await nzeroHandle.jsonValue()).toEqual(-0);
  });
});

describe('JSHandle.jsonValue', function() {
  it('should work', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => ({foo: 'bar'}));
    const json = await aHandle.jsonValue();
    expect(json).toEqual({foo: 'bar'});
  });
  it('should not work with dates', async({page, server}) => {
    const dateHandle = await page.evaluateHandle(() => new Date('2017-09-26T00:00:00.000Z'));
    const json = await dateHandle.jsonValue();
    expect(json).toEqual({});
  });
  it('should throw for circular objects', async({page, server}) => {
    const windowHandle = await page.evaluateHandle('window');
    let error = null;
    await windowHandle.jsonValue().catch(e => error = e);
    expect(error.message).toContain('Argument is a circular structure');
  });
  it('should work with tricky values', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => ({a: 1}));
    const json = await aHandle.jsonValue();
    expect(json).toEqual({a: 1});
  });
});

describe('JSHandle.getProperties', function() {
  it('should work', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => ({
      foo: 'bar'
    }));
    const properties = await aHandle.getProperties();
    const foo = properties.get('foo');
    expect(foo).toBeTruthy();
    expect(await foo.jsonValue()).toBe('bar');
  });
  it('should return empty map for non-objects', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => 123);
    const properties = await aHandle.getProperties();
    expect(properties.size).toBe(0);
  });
  it('should return even non-own properties', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => {
      class A {
        constructor() {
          this.a = '1';
        }
      }
      class B extends A {
        constructor() {
          super();
          this.b = '2';
        }
      }
      return new B();
    });
    const properties = await aHandle.getProperties();
    expect(await properties.get('a').jsonValue()).toBe('1');
    expect(await properties.get('b').jsonValue()).toBe('2');
  });
});

describe('JSHandle.asElement', function() {
  it('should work', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => document.body);
    const element = aHandle.asElement();
    expect(element).toBeTruthy();
  });
  it('should return null for non-elements', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => 2);
    const element = aHandle.asElement();
    expect(element).toBeFalsy();
  });
  it('should return ElementHandle for TextNodes', async({page, server}) => {
    await page.setContent('<div>ee!</div>');
    const aHandle = await page.evaluateHandle(() => document.querySelector('div').firstChild);
    const element = aHandle.asElement();
    expect(element).toBeTruthy();
    expect(await page.evaluate(e => e.nodeType === HTMLElement.TEXT_NODE, element)).toBeTruthy();
  });
  it('should work with nullified Node', async({page, server}) => {
    await page.setContent('<section>test</section>');
    await page.evaluate(() => delete Node);
    const handle = await page.evaluateHandle(() => document.querySelector('section'));
    const element = handle.asElement();
    expect(element).not.toBe(null);
  });
});

describe('JSHandle.toString', function() {
  it('should work for primitives', async({page, server}) => {
    const numberHandle = await page.evaluateHandle(() => 2);
    expect(numberHandle.toString()).toBe('JSHandle@2');
    const stringHandle = await page.evaluateHandle(() => 'a');
    expect(stringHandle.toString()).toBe('JSHandle@a');
  });
  it('should work for complicated objects', async({page, server}) => {
    const aHandle = await page.evaluateHandle(() => window);
    expect(aHandle.toString()).toBe('JSHandle@object');
  });
  it('should work for promises', async({page, server}) => {
    // wrap the promise in an object, otherwise we will await.
    const wrapperHandle = await page.evaluateHandle(() => ({b: Promise.resolve(123)}));
    const bHandle = await wrapperHandle.getProperty('b');
    expect(bHandle.toString()).toBe('JSHandle@promise');
  });
  it('should work with different subtypes', async({page, server}) => {
    expect((await page.evaluateHandle('(function(){})')).toString()).toBe('JSHandle@function');
    expect((await page.evaluateHandle('12')).toString()).toBe('JSHandle@12');
    expect((await page.evaluateHandle('true')).toString()).toBe('JSHandle@true');
    expect((await page.evaluateHandle('undefined')).toString()).toBe('JSHandle@undefined');
    expect((await page.evaluateHandle('"foo"')).toString()).toBe('JSHandle@foo');
    expect((await page.evaluateHandle('Symbol()')).toString()).toBe('JSHandle@symbol');
    expect((await page.evaluateHandle('new Map()')).toString()).toBe('JSHandle@map');
    expect((await page.evaluateHandle('new Set()')).toString()).toBe('JSHandle@set');
    expect((await page.evaluateHandle('[]')).toString()).toBe('JSHandle@array');
    expect((await page.evaluateHandle('null')).toString()).toBe('JSHandle@null');
    expect((await page.evaluateHandle('/foo/')).toString()).toBe('JSHandle@regexp');
    expect((await page.evaluateHandle('document.body')).toString()).toBe('JSHandle@node');
    expect((await page.evaluateHandle('new Date()')).toString()).toBe('JSHandle@date');
    expect((await page.evaluateHandle('new WeakMap()')).toString()).toBe('JSHandle@weakmap');
    expect((await page.evaluateHandle('new WeakSet()')).toString()).toBe('JSHandle@weakset');
    expect((await page.evaluateHandle('new Error()')).toString()).toBe('JSHandle@error');
    // TODO(yurys): change subtype from array to typedarray in WebKit.
    expect((await page.evaluateHandle('new Int32Array()')).toString()).toBe(WEBKIT ? 'JSHandle@array' : 'JSHandle@typedarray');
    expect((await page.evaluateHandle('new Proxy({}, {})')).toString()).toBe('JSHandle@proxy');
  });
});
