import cache, { setDefaults } from '../index';

function request(url: string, data: any) {
  return Promise.resolve({
    success: true,
    value: 1,
  });
}

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
