import cache, { setDefaults } from '../index';
import { request, falseRequest, errorRequest } from './helper';

const getDetail = cache<{ id: number; name: string }, { success: boolean; value: any }>(
  ({ id, name }) => {
    return request('/api/getDetail', { id, name });
  },
  {
    maxAge: 10,
    key: 'id',
  }
);

getDetail.do({ id: 1, name: 'zyy' });

const getDetail2 = cache<number, { success: boolean; value: any }>(
  (data) => {
    return request('/api/getDetail', data);
  },
  {
    maxAge: 10,
  }
);

getDetail2.do(1);

const getDetail3 = cache(
  (data) => {
    return request('/api/getDetail', data);
  },
  {
    maxAge: 10,
    key: 'id',
  }
);

getDetail2.do(1);
