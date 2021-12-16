# promise-cachify

[![Build Status](https://app.travis-ci.com/elvinzhu/promise-cachify.svg?branch=main)](https://app.travis-ci.com/elvinzhu/promise-cachify)
[![codecov](https://codecov.io/gh/elvinzhu/promise-cachify/branch/main/graph/badge.svg?v=1)](https://codecov.io/gh/elvinzhu/promise-cachify)

Caching for promises.

## Installation

```
npm install promise-cachify
```

## Features

- Concurrent de-duplication.
- Caching resolved values while ignore rejected.
- Data persistance.
- Strong and type-safe cache key generation.
- Customizable (key generation, exipre time... )
- Deletion of cached items.
- Debug mode
- Fully typescript-ready.
- No dependencies

## Get Started

### Basic Usage

```ts
import withCache from 'promise-cachify';

const getDetail = withCache(function (id: number) {
  return yourFetchFn('/api/getDetail', { id });
});

Promise.all([getDetail.do(1), getDetail.do(1), getDetail.do(1)]);
// concurrent request share the same http request.
// so the above results in just 1 http call;
// note the '.do(...)', that explicitly tell the reader
// "hi man, the result is problemly from cache! "

getDetail.do(1); // from cache;
```

### Deletion of cached items.

```ts
// clear all cached data for every 'id';
getDetail.clearAll();
// clear cached data for id=1
getDetail.clear(getDetail.getCacheKey(1));
// or the following, if you know how the cache key is generated;
getDetail.clear('$-1');

getDetail.do(1); // from server;
```

### Customize cache key

Most of time you don't need to do this, but this is needed when your params is complex.

```ts
const getDetail = withCache(
  function (id: number) {
    return yourFetchFn('/api/getDetail', { id });
  },
  {
    // same signature as the first argument of withCache
    key: (id) => String(id),
    // key: 'or_your_static_key',
  }
);
```

### Data persistance

```ts
const getDetail = withCache(
  function (id: number) {
    return yourFetchFn('/api/getDetail', { id });
  },
  {
    persist: 'your_global_unique_key',
    // persistMedia: 'sessionStorage', // default. Another available option is "localStorage"
  }
);
// this will respect to `expire` policy
```

### Debug

```ts
const getDetail = withCache(
  function (id: number) {
    return yourFetchFn('/api/getDetail', { id });
  },
  { debug: true }
);
// track cache behavior.
```

### Full example

```ts
const getDetail = withCache(
  function (id: number) {
    return yourFetchFn('/api/getDetail', { id });
  },
  {
    persist: 'CRM_USER_GETDETIAL',
    persistMedia: 'sessionStorage',
    maxAge: 2, // expire after 2 seconds
    debug: true,
    key: (id) => String(id),
  }
);
```

## API

- `do(...args: TArgs): Promise<TOut>`
- `getCacheKey(...args: TArgs): string | null;`
- `clear(key?: TKey): void;`
- `clearAll(): void;`
- `set(data: TOut | Promise<TOut>, key?: TKey): boolean;`
- `get(key?: TKey): Promise<TOut> | null;`
- `getAll(): Map<string, ICacheItem>;`
- `has(key?: TKey): boolean;`

## Key generation

auto-key-generation only supports signature with the following constraints;

```ts
type TValue = string | number | boolean;
fn(...args: ({ [key: string]: TValue } | TValue | TValue[])[])
```

- arguments that not satisfy the above constraints will cause no cache.
- the keys of an object will be sorted.
- none-string value will be prefixed with `$-`
- use default key if no arguments or one argument with `undefined` value

examples

| signature                                | key                                 |
| ---------------------------------------- | ----------------------------------- |
| fn({ id: 1, name: 'xx', age: 1 })        | 'age=\$-1&id=$-1&name=xx'           |
| fn('1', [1, '2'], { id: 1, name: null }) | '1&[\$-1_2]&id=\$-1&name=\$-null'   |
| fn({ id: 1 }, { id: 2 })                 | 'id=$-1&id=\$-2'                    |
| fn([1], ['2'])                           | '[\$-1]&[2]'                        |
| fn({})                                   | '{}'                                |
| fn(null)                                 | '$-null'                            |
| fn('null')                               | 'null'                              |
| fn() or fn(undefined)                    | '\_\_INTERNAL_USE\_\_'              |
| fn({ id: 1, d: { name: 'el' } })         | null and no cache will be performed |

see more at the first test case in `__test__/index.test.ts`

## Compatibility

browsers that support or polyfilled `Map` `Promise`

## Licence

MIT
