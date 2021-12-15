import { jest, describe, expect, test, it } from '@jest/globals';
import cache, { setDefaults, DefaultKey } from '../index';
import { request, requestFixed, falseRequest, sleep, errorRequest } from './helper';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const storePrefix = '[promise-cache]';
const consoleError = console.error;
afterEach(() => {
  console.error = consoleError;
});

test('getCacheKey work properly', () => {
  const getDetail = cache((...param: any[]) => request('/api/getDetail', param));
  // simple object
  expect(getDetail.getCacheKey({ id: 1, name: 'xx', age: 1 })).toBe('age=$-1&id=$-1&name=xx'); // note the order
  expect(getDetail.getCacheKey({ id: null, name: 'xx', age: undefined })).toBe('age=$-undefined&id=$-null&name=xx');
  expect(getDetail.getCacheKey({ id: null, name: 'xx', age: undefined })).toBe('age=$-undefined&id=$-null&name=xx');
  expect(getDetail.getCacheKey('1', [3], { id: 1, name: null })).toBe('1&$-3&id=$-1&name=$-null');
  expect(getDetail.getCacheKey({ id: 1 }, { id: 2 })).toBe('id=$-1&id=$-2');
  expect(getDetail.getCacheKey([1], [2])).toBe('$-1&$-2');
  expect(getDetail.getCacheKey({})).toBe('{}');
  // complex object is not allowed
  expect(getDetail.getCacheKey({ id: 1, d: { name: 'el' } })).toBeNull();
  expect(getDetail.getCacheKey([{ d: { name: 'el' } }])).toBeNull();
  expect(getDetail.getCacheKey(new Map())).toBeNull();
  // mutiple simple arguments
  expect(getDetail.getCacheKey(1, true, 'name')).toBe('$-1&$-true&name');
  expect(getDetail.getCacheKey('1', 'true', 'name')).toBe('1&true&name');
  expect(getDetail.getCacheKey('1', null, undefined)).toBe('1&$-null&$-undefined');
  // undefined
  expect(getDetail.getCacheKey(undefined, undefined)).toBe('$-undefined&$-undefined');
  expect(getDetail.getCacheKey('undefined')).toBe('undefined');
  expect(getDetail.getCacheKey()).toBe(DefaultKey);
  expect(getDetail.getCacheKey(undefined)).toBe(DefaultKey);
  // null
  expect(getDetail.getCacheKey(null)).toBe('$-null');
  expect(getDetail.getCacheKey('null')).toBe('null');
  // NaN
  expect(getDetail.getCacheKey(NaN)).toBe('$-NaN');
  expect(getDetail.getCacheKey('NaN')).toBe('NaN');
  // empty array
  expect(getDetail.getCacheKey([])).toBe('[]');
  expect(getDetail.getCacheKey([undefined])).toBe('$-undefined');
  expect(getDetail.getCacheKey([null])).toBe('$-null');
  // override default key;
  const getDetail2 = cache(() => request('/api/getDetail', 1), { key: '999' });
  expect(getDetail2.getCacheKey()).toBe('999');
  // bad custom key
  // @ts-ignore
  const getDetail3 = cache(() => request('/api/getDetail', 1), { key: new Map(), debug: true });
  getDetail3.do();
  expect(getDetail3.getCacheKey()).toBeNull();
  // @ts-ignore
  const getDetail4 = cache(() => request('/api/getDetail', 1), { key: {} });
  expect(getDetail4.getCacheKey()).toBeNull();
  // invalid key returned by function key
  const getDetail5 = cache(() => request('/api/getDetail', {}), {
    //@ts-ignore
    key: () => {
      return {};
    },
  });
  expect(getDetail5.getCacheKey()).toBeNull();
});

test('cache work perperty with concurrent call', async () => {
  const getDetailCall = jest.fn();
  const getDetail = cache(({ id }: { id: number }) => {
    getDetailCall();
    return request('/api/getDetail', { id });
  });
  const task = getDetail.do({ id: 1 });
  const task2 = getDetail.do({ id: 1 });
  expect(getDetailCall.call.length).toBe(1);
  const [res1, res2] = await Promise.all([task, task2]);
  expect(res1).toBeTruthy();
  expect(res1).toEqual(res2);
});

test('test with unhandledRejected exception', () => {
  const getDetail = cache((param) => {
    return errorRequest('/api/getDetail', param);
  });
  const data = { id: 1 };
  const task = getDetail.do(data);
  const errorCallback = jest.fn();
  expect(getDetail.has(getDetail.getCacheKey(data))).toBe(true);
  return task.catch(errorCallback).finally(() => {
    expect(errorCallback.call.length).toBe(1);
    expect(getDetail.has(getDetail.getCacheKey(data))).toBe(false);
  });
});

test('use default key properly', async () => {
  const getDetail = cache(() => Promise.resolve(1));
  await getDetail.do();
  expect(getDetail.has(DefaultKey)).toBe(true);

  const getDetail2 = cache(() => Promise.resolve(1));
  // empty object
  // @ts-ignore
  await getDetail2.do({});
  expect(getDetail2.has(DefaultKey)).toBe(false);

  const getDetail3 = cache(() => Promise.resolve(1));
  // @ts-ignore
  await getDetail3.do(undefined);

  expect(getDetail3.has(DefaultKey)).toBe(true);
});

test('maxAge work properly', async () => {
  const getDetail = cache(
    (param) => {
      return request('/api/getDetail', param);
    },
    { maxAge: 0.2 }
  );
  const data = { id: 120 };
  await getDetail.do(data);
  const cacheKey = getDetail.getCacheKey(data);
  expect(getDetail.has(cacheKey)).toBe(true);
  await sleep(201);
  expect(getDetail.has(cacheKey)).toBe(false);
});

test('function key work properly', async () => {
  const getDetail = cache(
    (param) => {
      return request('/api/getDetail', param);
    },
    { key: ({ id }) => 'fn_key_test_' + id }
  );
  const data = { id: 120 };
  await getDetail.do(data);
  const cacheKey = getDetail.getCacheKey(data);
  expect(cacheKey).toBe('fn_key_test_120');
  expect(getDetail.has(cacheKey)).toBe(true);
});

test('set & get & clear & has & getAll & clearAll work properly', async () => {
  const getDetail = cache((param) => request('/api/getDetail', param));
  const data = { success: false, data: 3 };

  const noneDefaultKey1 = 'xx=222';
  const data1 = { success: false, data: 1 };
  const noneDefaultKey2 = 'xx=224';
  const data2 = { success: false, data: 2 };

  getDetail.set(data);
  getDetail.set(data1, noneDefaultKey1);
  getDetail.set(data2, noneDefaultKey2);
  expect(getDetail.getAll().size).toBe(3);

  expect(getDetail.has(DefaultKey)).toBe(true);
  expect(await getDetail.get(DefaultKey)).toEqual(data);
  expect(await getDetail.get(noneDefaultKey1)).toEqual(data1);
  expect(await getDetail.get(noneDefaultKey2)).toEqual(data2);

  getDetail.clear(); //clear default key
  expect(getDetail.has(DefaultKey)).toBe(false);
  expect(getDetail.getAll().size).toBe(2);

  getDetail.clear(noneDefaultKey1);
  expect(getDetail.has(noneDefaultKey1)).toBe(false);
  expect(getDetail.getAll().size).toBe(1);

  getDetail.clearAll();
  expect(getDetail.getAll().size).toBe(0);

  expect(getDetail.get('a_not_exist_key')).toBe(null);
  // clear invalid key
  // @ts-ignore
  getDetail.clear(NaN);
});

test('auto remove after call "has"', async () => {
  // auto remove after call "has"
  const getDetail2 = cache((param) => request('/api/getDetail', param), {
    maxAge: 0.1,
  });
  getDetail2.do({ id: '1' });
  await sleep(101);
  expect(getDetail2.getAll().has('id=1')).toBe(true);
  expect(getDetail2.has('id=1')).toBe(false);
  expect(getDetail2.getAll().has('id=1')).toBe(false);
});

test('persist work properly', async () => {
  const callFn = jest.fn();
  const getDetail = cache(
    (param) => {
      callFn();
      return requestFixed('/api/getDetail', param);
    },
    { persist: 'key' }
  );
  const getDetail2 = cache((param) => requestFixed('/api/getDetail', param), { persist: 'key3', persistMedia: 'localStorage' });

  const data = { id: 1 };
  const resultData = {
    success: true,
    data: { id: 1 },
  };

  await getDetail.do(data);
  await getDetail2.do(data);

  const ret = [[getDetail.getCacheKey(data), { expire: 0, data: JSON.stringify(resultData) }]];

  await sleep(0);
  // store properly
  expect(callFn).toBeCalledTimes(1);
  expect(window.sessionStorage.getItem('PROMISE_CACHE_key')).toBe(JSON.stringify(ret));
  expect(window.localStorage.getItem('PROMISE_CACHE_key3')).toBe(JSON.stringify(ret));
  // read properly
  const res = await getDetail.do(data);
  expect(callFn).toBeCalledTimes(1);
  expect(res).toEqual(resultData);
});

test('duplicate "persist" catched correctly', async () => {
  const persist = 'duplicate_test';
  console.error = jest.fn();
  const getDetail = cache(() => Promise.resolve(1), { persist });
  const getDetail2 = cache(() => Promise.resolve(2), { persist });
  await getDetail.do();
  await getDetail2.do();
  expect(console.error).toHaveBeenCalledWith(storePrefix, expect.stringMatching('duplicate'));
});

test('invalid "persist" catched correctly', async () => {
  const persist = 321546897;
  console.error = jest.fn();
  // @ts-ignore
  const getDetail = cache(() => Promise.resolve(1), { persist });
  await getDetail.do();
  expect(console.error).toHaveBeenCalledWith(storePrefix, expect.stringMatching('invaid'));
});

test('auto remove storage key correctly', async () => {
  const getDetail = cache((param: { id: number }) => Promise.resolve(1), { persist: 'auto_remove_test' });
  await getDetail.do({ id: 1 });
  await getDetail.do({ id: 2 });
  await sleep(0);
  expect(sessionStorage.length).toBe(1);
  expect(getDetail.getAll().size).toBe(2);
  getDetail.clear(getDetail.getCacheKey({ id: 1 }));
  expect(getDetail.getAll().size).toBe(1);
  getDetail.clear(getDetail.getCacheKey({ id: 2 }));
  expect(getDetail.getAll().size).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test('load store data correctly', async () => {
  const persist = 'load_data_test';
  sessionStorage.setItem(
    'PROMISE_CACHE_' + persist,
    JSON.stringify([
      ['id=1', { expire: 0, data: JSON.stringify({ success: true, data: 1 }) }],
      ['id=2', { expire: 0, data: JSON.stringify({ success: true, data: 2 }) }],
    ])
  );

  const mockFn = jest.fn();
  const getDetail = cache(
    (param) => {
      mockFn();
      return Promise.resolve(1);
    },
    { persist }
  );
  expect(getDetail.has('id=1')).toBe(true);
  expect(getDetail.has('id=2')).toBe(true);
  await getDetail.do({ id: '1' }); // not { id: 1 }
  expect(mockFn).not.toBeCalled();
});

test('load dirty store data correctly', async () => {
  const persist = 'load_data_test2';
  sessionStorage.setItem('PROMISE_CACHE_' + persist, 'this is a piece of dirty data');
  const mockFn = (console.error = jest.fn());
  const getDetail = cache((param) => Promise.resolve(1), { persist });
  expect(getDetail.getAll().size).toBe(0);
  expect(mockFn).toHaveBeenCalled();
});

test('setDefaults works properly', async () => {
  const testData1 = { id: 0 };
  const persist = 'setDefaults_test';
  // test maxAge
  setDefaults({ maxAge: 0.2, persistMedia: 'localStorage' });
  const getDetail = cache((param) => Promise.resolve(1), { persist });
  await getDetail.do(testData1);
  expect(getDetail.has(getDetail.getCacheKey(testData1))).toBe(true);
  await sleep(201);
  expect(getDetail.has(getDetail.getCacheKey(testData1))).toBe(false);
  await sleep(0); // wait for micro task done.
  // test persist
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  await getDetail.do(testData1);
  await sleep(0);
  expect(localStorage.length).toBe(1);
  expect(sessionStorage.length).toBe(0);
  // invalid arguments
  setDefaults(undefined)
});
