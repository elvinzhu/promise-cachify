import { jest, describe, expect, test, it } from '@jest/globals';
import cache, { setDefaults } from '../index';
import { request, falseRequest, errorRequest } from './helper';

const getDetailCall = jest.fn();
const getDetail = cache<{ id: number }, { success: boolean; data: any }>(
  ({ id }) => {
    getDetailCall();
    return request('/api/getDetail', { id });
  },
  {
    maxAge: 10,
    key: 'id',
  }
);

test('only called once', () => {
  const task = getDetail.do({ id: 1 });
  const task2 = getDetail.do({ id: 1 });
  expect(getDetailCall.call.length).toBe(1);
  return Promise.all([task, task2]).then(([res1, res2]) => {
    expect(res1).toEqual(res2);
  });
});

// const getDetail2 = cache<number, { success: boolean; data: any }>(
//   (data) => {
//     return request('/api/getDetail', data);
//   },
//   {
//     maxAge: 10,
//   }
// );

// getDetail2.do(1);

// const getDetail3 = cache(
//   (data) => {
//     return request('/api/getDetail', data);
//   },
//   {
//     maxAge: 10,
//     key: 'id',
//   }
// );

// getDetail2.do(1);
