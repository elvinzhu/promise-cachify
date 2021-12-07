type TKey = string;
type TInputBase = { [key: string]: string | number | boolean | null | undefined };

interface ICacheConfig<TInput extends TInputBase> {
  /**
   * cache duration in seconds. pass 0 to make it never expires.
   * default: 0.
   */
  maxAge?: number;
  /**
   * custom cache key.
   * must be unique for current instance.
   * default: \"__INTERNAL_USE__\".
   */
  key?: (res: TInput) => string;
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
}

interface ICacheItem {
  expire: number;
  data: Promise<string>;
}

type TStoreItem = Omit<ICacheItem, 'data'> & { data: string };
type TDefaultConfig = Omit<ICacheConfig<any>, 'persist' | 'key'> & {
  /**
   * default cache key.
   */
  key?: string;
};

const UsedPersistKeys: string[] = [];
const LogPrefix = '[promise-cache]';
const StorePrefix = 'promise_cache_';

const DefaultConfig: TDefaultConfig = {
  maxAge: 0,
  debug: false,
  key: '__INTERNAL_USE__',
};

function isPlainObject(target: any) {
  return Object.prototype.toString.call(target) === '[object Object]';
}

// var a = new Map([[NaN, 1], [false, 2], [null, 3], [undefined, 4]]);
// console.log(JSON.stringify(Array.from(a.entries())))
// => "[[null,1],[false,2],[null,3],[null,4]]"

/**
 * rewrite undefined & null to default key;
 * @param key
 * @returns
 */
function normalizeKey(key: any) {
  return key === undefined || key === null ? DefaultConfig.key : key;
}

function logError(...args: any[]) {
  console.error(`${LogPrefix}`, ...args);
}

/**
 * generate cache key from object.
 * NOTE: sub-object will not work properly;
 * @param params
 * @returns
 */
function generateKey(params: TInputBase): string {
  if (isPlainObject(params)) {
    const objKeys = Object.keys(params);
    if (objKeys.length) {
      return objKeys
        .sort()
        .map((key) => `${key}=${String(params[key])}`)
        .join('&');
    }
  }
  return DefaultConfig.key;
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
    if (!config.key && typeof config.key !== 'undefined') {
      logError(`invaid default "key": ${config.key}. ignored.`);
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
export default function cache<TInput extends TInputBase, TOut>(resolver: (args: TInput) => Promise<TOut>, config?: ICacheConfig<TInput>) {
  let cacheMap: Map<TKey, ICacheItem>;
  let instanceConfig = { ...DefaultConfig, ...config };
  const { persist, persistMedia, debug } = instanceConfig;
  const isValidPersist = persist && typeof persist === 'string';

  const persistCache = () => {
    if (isValidPersist) {
      const newCacheMap: Map<TKey, TStoreItem> = new Map();
      cacheMap.forEach(async (value, key) => {
        const data = await value.data;
        newCacheMap.set(key, { ...value, data });
      });
      const json = JSON.stringify(Array.from(newCacheMap.entries()));
      getMediaHost().setItem(StorePrefix + persist, json);
    }
  };

  const getMediaHost = () => {
    if (persistMedia === 'localStorage') {
      return window.localStorage;
    }
    return window.sessionStorage;
  };

  const logDebug = (...msg: any[]) => {
    if (debug) {
      console.log(`${LogPrefix}`, ...msg);
    }
  };

  if (isValidPersist) {
    if (UsedPersistKeys.includes(persist)) {
      logError(`duplicate "persist": ${persist}. Ignored.`);
    } else {
      UsedPersistKeys.push(persist);
      try {
        const storeDataJson = JSON.parse(getMediaHost().getItem(persist)) as [TKey, string][];
        storeDataJson.map((item) => {
          const storeItem = JSON.parse(item[1]) as TStoreItem;
          cacheMap.set(item[0], {
            ...storeItem,
            data: Promise.resolve(storeItem.data),
          });
        });
        logDebug('init cache with', storeDataJson);
      } catch (error) {
        logError(error);
      }
    }
  } else if (persist) {
    logError(`invaid "persist": ${persist}. ignored.`);
  }

  /**
   * start call the "resolver" to resolve data.
   * @param params
   * @returns
   */
  function resolve(params?: TInput): Promise<TOut> {
    // lazy initialize
    if (!cacheMap) cacheMap = new Map();
    let cacheKey = getCacheKey(params);
    if (has(cacheKey)) {
      // read cache
      logDebug(`using cache with key:${cacheKey}`);
      return get(cacheKey);
    }
    let cacheData = resolver(params);
    if (cacheKey) {
      // set cache
      set(cacheData, cacheKey);
      cacheData = cacheData.catch((err) => {
        cacheMap.delete(cacheKey);
        logDebug('promise rejected, remove cache:', cacheKey, err);
        return Promise.reject(err);
      });
    }
    return cacheData;
  }

  /**
   * get cache key per TInput
   * @param params
   * @returns
   */
  function getCacheKey(params?: TInput): string | null {
    const { key } = instanceConfig;
    let cacheKey: TKey;
    if (typeof key === 'function') {
      // use custom key
      cacheKey = key(params);
    } else if (isPlainObject(params)) {
      // generate key from object
      cacheKey = generateKey(params);
    } else {
      // give it a default value if match condition
      cacheKey = normalizeKey(params);
    }
    if (cacheKey && typeof cacheKey === 'string') {
      // only string key is allowed.
      return cacheKey;
    }
    return null;
  }

  /**
   * clear cache.
   * @param key cache key. use default value if missing
   */
  function clear(key?: TKey): void {
    key = normalizeKey(key);
    if (key) {
      cacheMap.delete(key);
    } else {
      cacheMap.clear();
    }
    persistCache();
  }

  /**
   * clear all
   */
  function clearAll(): void {
    cacheMap.clear();
    if (isValidPersist) {
      getMediaHost().removeItem(StorePrefix + persist);
    }
  }

  /**
   * set cache data
   * @param value data
   * @param key cache key.
   */
  function set(data: TOut | Promise<TOut>, key?: TKey) {
    key = normalizeKey(key);
    const { maxAge } = instanceConfig;
    const expire = maxAge > 0 ? Date.now() + maxAge * 1000 : 0;
    const cacheData = Promise.resolve(data).then(JSON.stringify); // DO NOT append .then or .catch
    // must set in sync, or the concurrent request wont get it.
    cacheMap.set(key, { expire, data: cacheData });
    logDebug(`set cache with key:${key}, expires at: ${new Date(expire)}`);
    if (maxAge > 0 && maxAge < 60 * 5) {
      // relase memory ASAP if maxAge less 5 minute
      setTimeout(() => clear(key), maxAge * 1000);
    }
    cacheData.then(persistCache).catch(() => {
      // this is a new Promise instance,
      // so hide the rejection
    });
  }

  /**
   * retrieve cached data.
   * @param key cache key. use default value if missing
   * @returns
   */
  function get(key?: TKey): Promise<TOut> | null {
    key = normalizeKey(key);
    if (has(key)) {
      return cacheMap.get(key).data.then((res) => JSON.parse(res) as TOut);
    }
    return null;
  }

  /**
   * get all cached data. Be carefull to NOT dirty the data.
   * @returns
   */
  function getAll() {
    return cacheMap;
  }

  /**
   * check if cache key exist.
   * @param key cache key. use default value if missing
   * @returns
   */
  function has(key?: TKey): boolean {
    key = normalizeKey(key);
    if (cacheMap.has(key)) {
      const data = cacheMap.get(key);
      if (!data.expire || Date.now() <= data.expire) {
        return true;
      }
      cacheMap.delete(key); // release memory
    }
    return false;
  }

  return { do: resolve, set, get, has, clear, clearAll, getAll, getCacheKey };
}
