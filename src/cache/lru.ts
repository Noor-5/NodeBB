
import LRUCache, { Options as LRUCacheOptions } from 'lru-cache';
import * as winston from 'winston';
import chalk from 'chalk';
import pubsub from '../pubsub';

interface Cache {
    name: string
    hits: number;
    misses: number;
    enabled: boolean;
    set(key: any, value: any, ttl?: number): void;
    get(key: any): any;
    del(keys: any | any[]): void;
    reset(): void;
    clear(): void;
    getUnCachedKeys(keys: any[], cachedData: Record<any, any>): any[];
    dump(): any;
    peek(key: any): any;
}
function createLRUCache(opts: LRUCacheOptions<string, any>): Cache {
    // sometimes we kept passing in `length` with no corresponding `maxSize`.
    // This is now enforced in v7; drop superfluous property
    if (opts.hasOwnProperty('length') && !opts.hasOwnProperty('maxSize')) {
        winston.warn(`[cache/init($name)] ${chalk.white.bgRed.bold('DEPRECATION')} ${chalk.yellow('length')} was passed in without a corresponding ${chalk.yellow('maxSize')}. Both are now required as of lru-cache@7.0.0.`);
        delete opts.length;
    }
    const deprecations = new Map([
        ['stale', 'allowStale'],
        ['maxAge', 'ttl'],
        ['length', 'sizeCalculation'],
    ]);
    deprecations.forEach((newProp: string, oldProp: string) => {
        if (opts.hasOwnProperty(oldProp) && !opts.hasOwnProperty(newProp)) {
            winston.warn(`[cache/init($name)] ${chalk.white.bgRed.bold('DEPRECATION')} The option ${chalk.yellow(oldProp)} has been deprecated as of lru-cache@7.0.0. Please change this to ${chalk.yellow(newProp)} instead.`);
            opts[newProp] = opts[oldProp] as number;
            delete opts[oldProp];
        }
    });

    const lruCache = new LRUCache(opts);

    const cache: Cache = {
        name: 'Cache',
        hits: 0,
        misses: 0,
        enabled: true,

        set(key:string, value:string, ttl) {
            if (!cache.enabled) {
                return;
            }
            if (ttl !== undefined) {
                opts[ttl] = ttl;
            }
            lruCache.set(key, value, opts);
        },
        get(key: string) {
            if (!cache.enabled) {
                return undefined;
            }
            const data: string = lruCache.get(key);
            if (data === undefined) {
                cache.misses += 1;
            } else {
                cache.hits += 1;
            }
            return data;
        },

        del(keys: string | string[]) {
            if (!Array.isArray(keys)) {
                keys = [keys];
            }
            pubsub.publish(`$cache:lruCache:del`, keys);
            keys.forEach((key: string) => lruCache.delete(key));
        },



        reset() {
            pubsub.publish(`${cache.name}:lruCache:reset`);
            lruCache.clear();
            cache.hits = 0;
            cache.misses = 0;
        },

        clear() {
            cache.reset();
        },

        getUnCachedKeys(keys:string[], cachedData): any[] {
            if (!cache.enabled) {
                return keys;
            }
            type lruGetType = ReturnType<typeof lruCache.get>;
            let data: lruGetType;
            let isCached: boolean;
            const unCachedKeys = keys.filter((key) => {
                data = cache.get(key);
                isCached = data !== undefined;
                if (isCached) {
                    cachedData[key] = data;
                }
                return !isCached;
            });
            const hits = keys.length - unCachedKeys.length;
            const misses = keys.length - hits;
            cache.hits += hits;
            cache.misses += misses;
            return unCachedKeys;
        },
        dump() {
            return lruCache.dump();
        },
        peek(key:string) : string {
            return lruCache.peek(key);
        },
    };
    // const cacheSet = lruCache.set;
    function localReset() {
        lruCache.clear();
        cache.hits = 0;
        cache.misses = 0;
    }
    // expose properties while keeping backwards compatibility
    const propertyMap = new Map([
        ['length', 'calculatedSize'],
        ['calculatedSize', 'calculatedSize'],
        ['max', 'max'],
        ['maxSize', 'maxSize'],
        ['itemCount', 'size'],
        ['size', 'size'],
        ['ttl', 'ttl'],
    ]);
    propertyMap.forEach((lruProp: string, cacheProp: string) => {
        Object.defineProperty(cache, cacheProp, {
            get: function () : string {
                return String(lruCache[lruProp]);
            },
            configurable: true,
            enumerable: true,
        });
    });


    pubsub.on(`${cache.name}:lruCache:reset`, () => {
        localReset();
    });

    pubsub.on(`${cache.name}:lruCache:del`, (keys: string[]) => {
        if (Array.isArray(keys)) {
            keys.forEach(key => lruCache.delete(key));
        }
    });

    return cache;
}

export = createLRUCache;
