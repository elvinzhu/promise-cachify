import { klona } from 'klona';

interface ICacheConfig<TInput extends { [key: string]: any }, TOut> {
  /**
   * cache duration in seconds. pass 0 to make it never expires.
   * default: 0.
   */
  maxAge: number;
  /**
   * the property name of TInput used for cache.
   * Must be unique for current instance.
   * default: '__default'.
   */
  key?: keyof TInput | ((args: TInput) => string);
  /**
   * if to store into storage for next use.
   */
  persist?: string;
  /**
   * the media to persist data into.
   * default: "sessionStorage"
   */
  persistMedia?: 'localStorage' | 'sessionStorage';
  /**
   * if to log some info for debug.
   */
  debug?: boolean;
  /**
   * get the exact data to cache.
   */
  getData?: (res: any) => TOut;
}

interface ICacheItem<T> {
  expire: number;
  data: T;
}

const DefaultConfig: Omit<ICacheConfig<any, any>, 'persist'> = {
  maxAge: 0,
  key: '__default',
};

const UsedPersistKeys: string[] = [];
const LogPrefix = '[cache]';

function logError(err: any) {
  console.error(`${LogPrefix}`, err);
}

/**
 * 设置默认配置
 * @param config
 */
export function setDefaults(config: typeof DefaultConfig) {
  if (config && Object.prototype.toString.call(config) === '[object Object]') {
    if ('persist' in config) {
      logError(`You CAN NOT set default "persist". ignored.`);
      // @ts-ignore avoid passing persist
      delete config.persist;
    }
    if (!config.key) {
      logError(`Invaid default "key": ${config.key as string}. ignored.`);
      delete config.key;
    }
    Object.assign(DefaultConfig, config);
  }
}

export default function cache<TInput extends { [key: string]: any }, TOut = any>(resolver: (args: TInput) => Promise<TOut>, config?: ICacheConfig<TInput, TOut>) {
  let cacheMap: Map<string, ICacheItem<TOut>>;
  let instanceConfig = { ...DefaultConfig, ...config };
  const { persist, persistMedia, debug } = instanceConfig;

  function getMediaHost() {
    if (persistMedia === 'localStorage') {
      return window.localStorage;
    }
    return window.sessionStorage;
  }

  function logDebug(msg: any) {
    if (debug) {
      console.log(`${LogPrefix}`, msg);
    }
  }

  if (persist && typeof persist === 'string') {
    if (UsedPersistKeys.includes(persist)) {
      logError('duplicate "persist" =>' + persist);
    } else {
      UsedPersistKeys.push(persist);
      try {
        const storeDataJson = getMediaHost().getItem(persist);
        cacheMap = new Map(JSON.parse(storeDataJson));
      } catch (error) {
        logError(error);
      }
    }
  }

  return {
    do(params: TInput): Promise<TOut> {
      if (!cacheMap) cacheMap = new Map();
      const { key, getData } = instanceConfig;
      const cacheKey = (typeof key === 'function' ? key(params) : params[key]) || DefaultConfig.key;
      // read cache
      if (this.has(cacheKey)) {
        logDebug('using cache with key:' + cacheKey);
        return this.get(cacheKey);
      }
      // set cache
      return resolver(params).then((res) => {
        let ret = res;
        if (typeof getData === 'function') {
          ret = getData(res);
        }
        this.set(cacheKey, ret);
        return ret;
      });
    },
    clear(key?: string): void {
      if (key) {
        cacheMap.delete(key);
      } else {
        cacheMap.clear();
      }
      this.persist();
    },
    persist() {
      if (persist) {
        try {
          const json = JSON.stringify(Array.from(cacheMap.entries()));
          getMediaHost().setItem(persist, json);
        } catch (error) {
          logError(error);
        }
      }
    },
    set(key: string, value: TOut) {
      const { maxAge } = instanceConfig;
      const expire = maxAge > 0 ? Date.now() + maxAge * 100 : 0;
      logDebug(`set cache with key:${key}, expires at ${new Date(expire)}`);
      cacheMap.set(key, {
        expire,
        data: klona<TOut>(value),
      });
      if (maxAge > 0) {
        // relase memory ASAP
        setTimeout(() => {
          this.clear(key);
        }, 0);
      }
      this.persist();
    },
    get(key: string): TOut | null {
      if (this.has(key)) {
        return klona<TOut>(cacheMap.get(key).data);
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
