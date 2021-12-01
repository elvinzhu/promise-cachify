type TAnyObject = { [key: string]: any };
type TKey = string | number | boolean;
type TInputBase = TAnyObject | TKey;

interface ICacheConfig<TInput extends TInputBase, TOut> {
  /**
   * cache duration in seconds. pass 0 to make it never expires.
   * default: 0.
   */
  maxAge: number;
  /**
   * the property name of TInput used for cache key.
   * Must be unique for current instance.
   * only string | number | boolean is allowed to be a key.
   * default: "__INTERNAL_USE__".
   */
  // key?: keyof TInput | ((args: TInput) => string);
  key?: (TInput extends TAnyObject ? keyof TInput : never) | ((args: TInput) => string);
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
  getData?: (res: TOut) => TOut;
  /**
   * determine if to cache the data
   */
  canCache?: (res: TOut) => TOut;
}

interface ICacheItem {
  expire: number;
  data: string;
}

type TDefaultConfig = Omit<ICacheConfig<any, any>, 'persist' | 'key'> & {
  /**
   * default cache key.
   */
  key: string;
};

const DefaultConfig: TDefaultConfig = {
  maxAge: 0,
  debug: false,
  key: '__INTERNAL_USE__',
};

const UsedPersistKeys: string[] = [];
const LogPrefix = '[promise-cache]';

function isPlainObject(target: any) {
  return Object.prototype.toString.call(target) === '[object Object]';
}

// var a = new Map([[NaN, 1], [false, 2], [null, 3], [undefined, 4]]);
// console.log(JSON.stringify(Array.from(a.entries())))
// => [[null,1],[false,2],[null,3],[null,4]]

function isValidKey(target: any) {
  return ['number', 'string', 'boolean'].includes(typeof target);
}

function normalizeKey(key: any): TKey {
  return key === undefined ? DefaultConfig.key : key;
}

function logError(err: any) {
  console.error(`${LogPrefix}`, err);
}

/**
 * set default cache config.
 * @param config
 */
export function setDefaults(config: TDefaultConfig) {
  if (config && isPlainObject(config)) {
    if ('persist' in config) {
      logError(`you CAN NOT set default "persist". ignored.`);
      // @ts-ignore avoid passing persist
      delete config.persist;
    }
    if (!config.key) {
      logError(`invaid default "key": ${config.key}. Ignored.`);
      delete config.key;
    }
    Object.assign(DefaultConfig, config);
  }
}

/**
 * make the fetch result of the "resolver" cacheable.
 * @param resolver data fetcher
 * @param config cache config
 * @returns
 */
export default function cache<TInput extends TInputBase, TOut = any>(resolver: (args: TInput) => Promise<TOut>, config?: ICacheConfig<TInput, TOut>) {
  let cacheMap: Map<TKey, ICacheItem>;
  let instanceConfig = { ...DefaultConfig, ...config };
  const { persist, persistMedia, debug } = instanceConfig;
  const isValidPersist = persist && typeof persist === 'string';

  const persistCache = () => {
    if (isValidPersist) {
      try {
        const json = JSON.stringify(Array.from(cacheMap.entries()));
        getMediaHost().setItem(persist, json);
      } catch (error) {
        logError(error);
      }
    }
  };

  const getMediaHost = () => {
    if (persistMedia === 'localStorage') {
      return window.localStorage;
    }
    return window.sessionStorage;
  };

  const logDebug = (msg: any) => {
    if (debug) {
      console.log(`${LogPrefix}`, msg);
    }
  };

  if (isValidPersist) {
    if (UsedPersistKeys.includes(persist)) {
      logError(`duplicate "persist": ${persist}. Ignored.`);
    } else {
      UsedPersistKeys.push(persist);
      try {
        const storeDataJson = getMediaHost().getItem(persist);
        cacheMap = new Map(JSON.parse(storeDataJson));
        logDebug('init cache with' + storeDataJson);
      } catch (error) {
        logError(error);
      }
    }
  } else if (persist) {
    logError(`invaid "persist": ${persist}. Ignored.`);
  }

  return {
    /**
     * start call the "resolver" to fetch data.
     * @param params
     * @returns
     */
    do(params: TInput): Promise<TOut> {
      if (!cacheMap) cacheMap = new Map();
      const { key, getData, canCache } = instanceConfig;
      let cacheKey: TKey;
      if (typeof key === 'function') {
        cacheKey = key(params);
      } else if (isPlainObject(params)) {
        cacheKey = (params as TAnyObject)[key as string];
      } else {
        cacheKey = params as any;
      }
      cacheKey = normalizeKey(cacheKey) as any;
      if (this.has(cacheKey)) {
        // read cache
        logDebug(`using cache with key:${cacheKey}`);
        return this.get(cacheKey);
      }
      // set cache
      return resolver(params).then((res) => {
        let ret = res;
        if (typeof getData === 'function') {
          ret = getData(res);
        }
        if (!canCache || (typeof canCache === 'function' && canCache(res))) {
          this.set(ret, cacheKey);
        }
        return ret;
      });
    },
    /**
     * clear cache.
     * @param key cache key.
     */
    clear(key?: TKey): void {
      key = normalizeKey(key);
      if (key) {
        cacheMap.delete(key);
      } else {
        cacheMap.clear();
      }
      persistCache();
    },
    /**
     * set cache data
     * @param value data
     * @param key cache key.
     */
    set(data: TOut, key?: TKey) {
      key = normalizeKey(key);
      if (isValidKey(key)) {
        const { maxAge } = instanceConfig;
        const expire = maxAge > 0 ? Date.now() + maxAge * 1000 : 0;
        logDebug(`set cache with key:${key}, expires at ${new Date(expire)}`);
        cacheMap.set(key, {
          expire,
          data: JSON.stringify(data),
        });
        if (maxAge > 0) {
          // relase memory ASAP
          setTimeout(() => this.clear(key), maxAge * 1000);
        }
        persistCache();
      } else {
        logError(`invaid "key": ${String(key)}. Ignored.`);
      }
    },
    /**
     * retrieve cache data.
     * @param key cache key.
     * @returns
     */
    get(key?: TKey): TOut | null {
      key = normalizeKey(key);
      if (this.has(key)) {
        return JSON.parse(cacheMap.get(key).data) as TOut;
      }
      return null;
    },
    /**
     * get all cached data. Be carefull to NOT dirty the data.
     * @returns
     */
    getAll() {
      return cacheMap;
    },
    /**
     * check if cache key exist.
     * @param key cache key.
     * @returns
     */
    has(key?: TKey): boolean {
      key = normalizeKey(key);
      if (cacheMap.has(key)) {
        const data = cacheMap.get(key);
        if (!data.expire || Date.now() <= data.expire) {
          return true;
        }
        cacheMap.delete(key); // release memory
      }
      return false;
    },
  };
}
