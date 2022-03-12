type TKey = string;
// type TValue = string | number | boolean;
// type TArgsBase = [{ [key: string]: TValue }] | TValue[];
type GetPromiseT<C extends Promise<any>> = C extends Promise<infer T> ? T : any;

interface ICacheConfig<TArgs extends any[]> {
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
  key?: string | ((this: CacheHandler<TArgs, any>, ...args: TArgs) => string);
  /**
   * the key used to store data into storage.
   */
  persist?: string;
  /**
   * the media to persist data into.
   * default: "sessionStorage"
   */
  persistMedia?: 'localStorage' | 'sessionStorage';
  /**
   * if to log some info for debug purpose.
   */
  debug?: boolean;
}

interface ICacheItem {
  /**
   * expire time. 0 means never expire.
   */
  expire: number;
  data: Promise<string>;
}

type TStoreItem = Omit<ICacheItem, 'data'> & { data: string };
type TDefaultConfig = Omit<ICacheConfig<any>, 'persist' | 'key'>;

const UsedPersistKeys: string[] = [];
const LogPrefix = '[promise-cachify]';
const StorePrefix = 'PROMISE_CACHIFY_';

export const DefaultKey = '__INTERNAL_USE__';

const DefaultConfig: TDefaultConfig = {
  maxAge: 0,
  debug: false,
};

function isPlainObject(target: any) {
  return Object.prototype.toString.call(target) === '[object Object]';
}

function isString(target: any) {
  return typeof target === 'string';
}

function isBadKeySegment(value: any) {
  if (value === null || value === undefined) {
    return false;
  }
  return !['string', 'number', 'boolean'].includes(typeof value);
}

// var a = new Map([[NaN, 1], [false, 2], [null, 3], [undefined, 4]]);
// console.log(JSON.stringify(Array.from(a.entries())))
// => "[[null,1],[false,2],[null,3],[null,4]]"

/**
 * rewrite undefined to default key;
 * @param key
 * @returns
 */
function normalizeKey(key: any) {
  return key === undefined ? DefaultKey : key;
}

function logError(...args: any[]) {
  const params: any[] = Array.prototype.slice.call(arguments, 0);
  params.unshift(`${LogPrefix}`, new Date().toLocaleTimeString(), '--');
  console.error.apply(console, params);
}

function logDebug(debug: boolean, ...args: any[]) {
  if (debug) {
    const params: any[] = Array.prototype.slice.call(arguments, 1);
    params.unshift(`%c${LogPrefix}`, 'color: #2f54eb', new Date().toLocaleTimeString(), '--');
    console.error.apply(console, params);
  }
}

/**
 * generate cache key from simple object. eg. array/object with values of "string | number | boolean".
 * only support one-level nested object
 * otherwise will get null
 * @param args
 * @returns
 */
function generateKey(args: any[]): string | null {
  if (args.length === 1 && args[0] === undefined) {
    return DefaultKey;
  }
  let keySegments: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i];
    if (isPlainObject(currentArg)) {
      const objKeys = Object.keys(currentArg);
      if (objKeys.length) {
        if (Object.values(currentArg).filter(isBadKeySegment).length) {
          return null;
        } else {
          keySegments = keySegments.concat(objKeys.sort().map((key) => `${key}=${transformKey(currentArg[key])}`));
        }
      } else {
        keySegments.push('{}');
      }
    } else if (Array.isArray(currentArg)) {
      if (currentArg.length) {
        if (currentArg.filter(isBadKeySegment).length) {
          return null;
        } else {
          keySegments.push('[' + currentArg.map(transformKey).join('_') + ']');
        }
      } else {
        keySegments.push('[]');
      }
    } else if (!isBadKeySegment(currentArg)) {
      keySegments.push(transformKey(currentArg));
    }
  }
  if (keySegments.length) {
    return keySegments.join('&');
  }
  return null;
}

function transformKey(key: any): string | null {
  if (typeof key === 'string') {
    return key;
  }
  return isBadKeySegment(key) ? null : `$-${String(key)}`;
}

class CacheHandler<TArgs extends any[], TOut> {
  private _cacheMap: Map<TKey, ICacheItem> = new Map();
  private _config: ICacheConfig<TArgs>;
  private _persist?: string;
  private _resolver: (...args: TArgs) => Promise<TOut>;

  constructor(resolver: (...args: TArgs) => Promise<TOut>, config: ICacheConfig<TArgs>) {
    this._config = Object.assign({}, DefaultConfig, config);
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
        const primiseArr: Promise<[TKey, TStoreItem]>[] = [];
        this._cacheMap.forEach((value, key) => {
          primiseArr.push(value.data.then((res) => [key, { expire: value.expire, data: res }]));
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
          const storeData = JSON.parse(storeDataJson) as [TKey, TStoreItem][];
          storeData.map(([key, data]) => {
            this._cacheMap.set(key, {
              expire: data.expire,
              data: Promise.resolve(data.data),
            });
          });
          logDebug(this._config.debug, 'init cache with', storeData);
        }
      } catch (error) {
        logError('load storage data failed.', error);
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

  /**
   * start to resolve data.
   * @param params
   * @returns
   */
  do(...args: TArgs): Promise<TOut> {
    const { debug } = this._config;
    let cacheKey = this.getCacheKey(...args);
    if (cacheKey && this.has(cacheKey)) {
      // read cache
      logDebug(debug, `using cache with key:${cacheKey}`);
      return this.get(cacheKey);
    }
    let cacheData = this._resolver(...args);
    if (cacheKey) {
      // set cache
      this.set(cacheData, cacheKey);
    } else {
      logDebug(debug, `cache key is invalid`);
    }
    return cacheData;
  }

  /**
   * get cache key per TArgs
   * @param params
   * @returns
   */
  getCacheKey(...args: TArgs): string | null {
    const { key } = this._config;
    let cacheKey: TKey;
    // custom key has the first priority;
    if (key !== undefined) {
      if (typeof key === 'function') {
        // user generated key
        cacheKey = transformKey(key.apply(this, args));
      } else if (!isBadKeySegment(key)) {
        // static custom key
        cacheKey = transformKey(key);
      } else {
        // invalid key, ignored.
        cacheKey = null;
      }
    } else if (args.length) {
      // have arguments. try to auto generate key
      cacheKey = generateKey(args);
    } else {
      // no arguments, give it a default value
      cacheKey = DefaultKey;
    }
    return cacheKey;
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
    if (!isString(key)) return false;
    const { maxAge, debug } = this._config;
    const expire = maxAge > 0 ? Date.now() + maxAge * 1000 : 0;
    const originTask = Promise.resolve(data);
    const cacheData = originTask.then((res) => {
      this._persistCache();
      return JSON.stringify(res);
    });
    // avoid error to dirty the devtool console
    cacheData.catch(() => {});
    // must be set in sync, or the concurrent request wont get it.
    this._cacheMap.set(key, { expire, data: cacheData });
    logDebug(debug, `set cache with key:${key}, expire at: ${expire > 0 ? new Date(expire) : 'never'}`);
    // use `originTask` to make sure this happen earlier than user's `catch`
    // or user might be 'see' the cached item.
    originTask.catch((err: any) => {
      this._cacheMap.delete(key);
      logDebug(debug, 'promise rejected, remove cache:', key, err);
    });
    return true;
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
   * check if cache exist.
   * @param key cache key. use default key if missing
   * @returns
   */
  has(key?: TKey): boolean {
    key = normalizeKey(key);
    if (this._cacheMap.has(key)) {
      const data = this._cacheMap.get(key);
      if (data.expire && Date.now() > data.expire) {
        this.clear(key); // expired. so release memory
      } else {
        return true;
      }
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
    const { debug, maxAge, persistMedia } = config;
    if (maxAge >= 0) {
      DefaultConfig.maxAge = maxAge;
    }
    if (debug !== undefined) {
      DefaultConfig.debug = !!debug;
    }
    if (persistMedia) {
      DefaultConfig.persistMedia = persistMedia;
    }
  }
}

/**
 * make the fetch result of the "resolver" cacheable.
 * @param resolver data fetcher
 * @param config cache config
 * @returns
 */
export default function withCache<T extends (...args: any) => Promise<any>>(resolver: T, config?: ICacheConfig<Parameters<T>>) {
  return new CacheHandler<Parameters<T>, GetPromiseT<ReturnType<T>>>(resolver, config);
}

/**
 * make the fetch result of the "resolver" cacheable.
 * @param resolver data fetcher
 * @param config cache config
 * @returns
 */
export function cache<T extends (...args: any) => Promise<any>>(resolver: T, config?: ICacheConfig<Parameters<T>>) {
  const instance = new CacheHandler<Parameters<T>, GetPromiseT<ReturnType<T>>>(resolver, config);
  function run(...args: Parameters<T>) {
    return instance.do(...args);
  }
  run.cache = instance;
  return run;
}

// function request(id: number, name: string) {
//   return Promise.resolve(1);
// }

// type Out = Parameters<Parameters<ReturnType<typeof request>['then']>[0]>[0];
// const getDetail = cache(request);

// getDetail(1, 'zyy');
