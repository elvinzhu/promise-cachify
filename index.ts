import { klona } from 'klona';

interface ICacheConfig<TInput, TOut> {
  /**
   * cache duration in seconds. pass 0 to make it never expires. default: 0.
   */
  maxAge: number;
  /**
   * cache key. Must be unique for each instance. default: '__default'.
   */
  key?: string | ((args: TInput) => string);
  /**
   * if to store into storage for next use.
   */
  persist?: string;
  /**
   * the media to persist data into. default: "sessionStorage"
   */
  persistMedia?: 'localStorage' | 'sessionStorage';
  /**
   * if to log some info for debug.
   */
  debug?: boolean;
  /**
   * if to ignore when promise rejected
   */
  ignoreError?: boolean;
  /**
   * get the exact data to cache.
   */
  getData?: (res: any) => TOut;
  /**
   * detemine if to cache the data.
   */
  canCache?: (res: TOut) => boolean;
}

interface ICacheItem<T> {
  expire: number;
  data: T;
}

const UsedPersistKeys = [];

function cache<TInput, TOut = any>(resolver: (args: TInput) => Promise<TOut>, config?: ICacheConfig<TInput, TOut>) {
  const cacheConfig = { ...cache.defaults, ...config };
  let cacheMap: Map<string, ICacheItem<TOut>>;

  function getConfig(itemConfig: ICacheConfig<TInput, TOut>) {
    return { ...cache.defaults, ...config, ...itemConfig };
  }

  return {
    do(params: TInput, itemConfig?: ICacheConfig<TInput, TOut>): Promise<TOut> {
      if (!cacheMap) cacheMap = new Map();
      const { key, maxAge, getData, canCache } = getConfig(itemConfig);
      let cacheKey = key as string;
      if (typeof key === 'function') {
        cacheKey = key(params);
      }
      // read cache
      if (this.has(cacheKey)) {
        return Promise.resolve(cacheMap.get(cacheKey).data);
      }
      // set cache
      const task = resolver(params).then((res) => {
        if (typeof getData === 'function') {
          const data = getData(res);
          // if(data)
        }
      });
      // task.then((res) => {}).then;
      return resolver(params);
    },
    clear(key?: string): void {
      if (key) {
        cacheMap.delete(key);
      } else {
        cacheMap.clear();
      }
    },
    set(key: string, value: TOut, itemConfig?: Pick<ICacheConfig<TInput, TOut>, 'maxAge'>) {
      const { maxAge } = getConfig(itemConfig);
      cacheMap.set(key, {
        expire: maxAge > 0 ? Date.now() + maxAge * 100 : 0,
        data: klona<TOut>(value),
      });
      if (config) {
        const { persist, persistMedia } = config;
        if (persist) {
          if (persistMedia === 'localStorage') {
            window.localStorage.setItem(persist, JSON.stringify(value));
          } else {
            window.sessionStorage.setItem(persist, JSON.stringify(value));
          }
        }
      }
    },
    get(key: string): TOut | null {
      if (this.has(key)) {
        return cacheMap.get(key).data;
      }
      return null;
    },
    has(key?: string): boolean {
      if (cacheMap.has(key)) {
        const data = cacheMap.get(key);
        if (!data.expire || Date.now() <= data.expire) {
          return true;
        }
        cacheMap.delete(key); // release memory
      }
      return false;
    },
    // cache: cacheMap,  // This will probably dirty the data, so DO NOT do this,
  };
}

cache.defaults = {
  maxAge: 0,
  key: '__default',
  ignoreError: true,
} as Omit<ICacheConfig<any, any>, 'persist'>;

export default cache;

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
