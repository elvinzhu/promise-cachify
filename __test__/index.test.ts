import { jest, describe, expect, test, it } from '@jest/globals';
import cache, { setDefaults } from '../index';
import { request, falseRequest, errorRequest } from './helper';

test('only called once', () => {
  const getDetailCall = jest.fn();
  const getDetail = cache<{ id: number }, { success: boolean; data: any }>(
    ({ id }) => {
      getDetailCall();
      return request('/api/getDetail', { id });
    },
    { maxAge: 10 }
  );

  const task = getDetail.do({ id: 1 });
  const task2 = getDetail.do({ id: 1 });
  expect(getDetailCall.call.length).toBe(1);
  return Promise.all([task, task2]).then(([res1, res2]) => {
    expect(res1).toBeTruthy();
    expect(res1).toEqual(res2);
  });
});

test('test with unhandledRejected exception', () => {
  const getDetail = cache<{ id: number }, { success: boolean; data: any }>(
    (param) => {
      return errorRequest('/api/getDetail', param);
    },
    { maxAge: 10 }
  );

  const data = { id: 1 };
  const task = getDetail.do(data);
  expect(getDetail.has(getDetail.getCacheKey(data))).toBe(true);
  return task.finally(() => {
    expect(getDetail.has(getDetail.getCacheKey(data))).toBe(false);
  });
});
