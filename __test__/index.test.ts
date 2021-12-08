import { jest, describe, expect, test, it } from '@jest/globals';
import cache, { setDefaults, DefaultKey } from '../index';
import { request, requestFixed, falseRequest, sleep, errorRequest } from './helper';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

test('getCacheKey work properly', () => {
  const getDetail = cache((param) => request('/api/getDetail', param));
  const data = { id: 1, name: 'xx', age: 1 };
  expect(getDetail.getCacheKey(data)).toBe('age=1&id=1&name=xx');
});

test('cache work perperty with concurrent call', async () => {
  const getDetailCall = jest.fn();
  const getDetail = cache<{ id: number }, { success: boolean; data: any }>(({ id }) => {
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
  const getDetail = cache<{ id: number }, { success: boolean; data: any }>((param) => {
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
});

test('maxAge work properly', async () => {
  const getDetail = cache<{ id: number }, { success: boolean; data: any }>(
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

  const ret = [[getDetail.getCacheKey(data), JSON.stringify(resultData)]];

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
