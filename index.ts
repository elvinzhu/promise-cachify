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
const StorePrefix = 'PROMISE_CACHE_';

export const DefaultKey = '__INTERNAL_USE__';

const DefaultConfig: TDefaultConfig = {
  maxAge: 0,
  debug: false,
  key: DefaultKey,
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

class CacheHandler<TInput extends TInputBase, TOut> {
  private _cacheMap: Map<TKey, ICacheItem> = new Map();
  private _config: Omit<ICacheConfig<TInput>, 'key'> & { key?: string | ICacheConfig<TInput>['key'] };
  private _persist?: string;
  private _resolver: (args: TInput) => Promise<TOut>;

  constructor(resolver: (args: TInput) => Promise<TOut>, config: ICacheConfig<TInput>) {
    this._config = { ...DefaultConfig, ...config };
    this._resolver = resolver;
    const { persist } = this._config;
    if (persist && typeof persist === 'string') {
      if (UsedPersistKeys.includes(persist)) {
        logError(`duplicate "persist": ${persist}. Ignored.`);
      } else {
        UsedPersistKeys.push(persist);
        this._persist = StorePrefix + persist;
      }
    } else if (persist) {
      logError(`invaid "persist": ${persist}. ignored.`);
    }
    this._loadCache();
  }

  private _persistCache() {
    if (this._persist) {
      if (this._cacheMap.size) {
        const primiseArr: Promise<[string, string]>[] = [];
        this._cacheMap.forEach((value, key) => {
          primiseArr.push(value.data.then((res) => [key, res]));
        });
        Promise.all(primiseArr).then((data) => {
          const json = JSON.stringify(data);
          this._getMediaHost().setItem(this._persist, json);
        });
      } else {
        this._getMediaHost().removeItem(this._persist);
      }
    }
  }

  private _loadCache() {
    if (this._persist) {
      try {
        const storeDataJson = this._getMediaHost().getItem(this._persist);
        if (storeDataJson) {
          const storeData = JSON.parse(storeDataJson) as [TKey, string][];
          storeData.map((item) => {
            const storeItem = JSON.parse(item[1]) as TStoreItem;
            this._cacheMap.set(item[0], {
              ...storeItem,
              data: Promise.resolve(storeItem.data),
            });
          });
          this._logDebug('init cache with', storeData);
        }
      } catch (error) {
        logError(error);
      }
    }
  }

  private _getMediaHost() {
    const { persistMedia } = this._config;
    if (persistMedia === 'localStorage') {
      return window.localStorage;
    }
    return window.sessionStorage;
  }

  private _logDebug(...msg: any[]) {
    const { debug } = this._config;
    if (debug) {
      console.log(`${LogPrefix}`, ...msg);
    }
  }

  /**
   * start to resolve data.
   * @param params
   * @returns
   */
  do(params?: TInput): Promise<TOut> {
    let cacheKey = this.getCacheKey(params);
    if (this.has(cacheKey)) {
      // read cache
      this._logDebug(`using cache with key:${cacheKey}`);
      return this.get(cacheKey);
    }
    let cacheData = this._resolver(params);
    if (cacheKey) {
      // set cache
      this.set(cacheData, cacheKey);
      cacheData = cacheData.catch((err: any) => {
        this._cacheMap.delete(cacheKey);
        this._logDebug('promise rejected, remove cache:', cacheKey, err);
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
  getCacheKey(params?: TInput): string | null {
    const { key } = this._config;
    let cacheKey: TKey;
    if (typeof key === 'function') {
      // use custom key
      cacheKey = key(params);
    } else if (isPlainObject(params)) {
      // generate key from object
      cacheKey = generateKey(params);
    } else {
      // try give it a default value
      cacheKey = normalizeKey(params);
    }
    if (cacheKey && typeof cacheKey === 'string') {
      // only string key is allowed.
      return cacheKey;
    } else {
      logError(`invaid cache key: ${cacheKey}, only none-empty string is allowed.`);
    }
    return null;
  }

  /**
   * clear cache.
   * @param key cache key. use default key if missing
   */
  clear(key?: TKey): void {
    key = normalizeKey(key);
    if (key) {
      this._cacheMap.delete(key);
      this._persistCache();
    }
  }

  /**
   * clear all
   */
  clearAll(): void {
    this._cacheMap.clear();
    this._persistCache();
  }

  /**
   * set cache data
   * @param value data
   * @param key cache key.
   */
  set(data: TOut | Promise<TOut>, key?: TKey) {
    key = normalizeKey(key);
    const { maxAge } = this._config;
    const expire = maxAge > 0 ? Date.now() + maxAge * 1000 : 0;
    const cacheData = Promise.resolve(data).then(JSON.stringify); // DO NOT append .then or .catch
    // must be set in sync, or the concurrent request wont get it.
    this._cacheMap.set(key, { expire, data: cacheData });
    this._logDebug(`set cache with key:${key}, expires at: ${new Date(expire)}`);
    if (maxAge > 0 && maxAge < 60 * 5) {
      // relase memory ASAP if maxAge less 5 minute
      setTimeout(() => this.clear(key), maxAge * 1000);
    }
    cacheData
      .then(() => this._persistCache())
      .catch(() => {
        // this is a new Promise instance,
        // so hide the rejection to avoid dirty the console
      });
  }

  /**
   * retrieve cache data.
   * @param key cache key. use default key if missing
   * @returns
   */
  get(key?: TKey): Promise<TOut> | null {
    key = normalizeKey(key);
    if (this.has(key)) {
      return this._cacheMap.get(key).data.then((res) => JSON.parse(res) as TOut);
    }
    return null;
  }

  /**
   * get all cached data. Be carefull to NOT dirty the data.
   * @returns
   */
  getAll() {
    return this._cacheMap;
  }

  /**
   * check if cache key exist.
   * @param key cache key. use default key if missing
   * @returns
   */
  has(key?: TKey): boolean {
    key = normalizeKey(key);
    if (this._cacheMap.has(key)) {
      const data = this._cacheMap.get(key);
      if (!data.expire || Date.now() <= data.expire) {
        return true;
      }
      this._cacheMap.delete(key); // release memory
    }
    return false;
  }
}

/**
 * set default cache config.
 * @param config
 */
export function setDefaults(config: TDefaultConfig) {
  if (config && isPlainObject(config)) {
    // @ts-ignore avoid passing persist
    const { persist, ...rest } = config;
    if (!config.key && typeof config.key !== 'undefined') {
      logError(`invaid default "key": ${config.key}. ignored.`);
      delete config.key;
    }
    Object.assign(DefaultConfig, rest);
  }
}

/**
 * make the fetch result of the "resolver" cacheable.
 * @param resolver data fetcher
 * @param config cache config
 * @returns
 */
export default function cache<TInput extends TInputBase, TOut>(resolver: (args: TInput) => Promise<TOut>, config?: ICacheConfig<TInput>) {
  return new CacheHandler(resolver, config);
}
