"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const lru_cache_1 = __importDefault(require("lru-cache"));
const winston = __importStar(require("winston"));
const chalk_1 = __importDefault(require("chalk"));
const pubsub_1 = __importDefault(require("../pubsub"));
function createLRUCache(opts) {
    // sometimes we kept passing in `length` with no corresponding `maxSize`.
    // This is now enforced in v7; drop superfluous property
    if (opts.hasOwnProperty('length') && !opts.hasOwnProperty('maxSize')) {
        winston.warn(`[cache/init($name)] ${chalk_1.default.white.bgRed.bold('DEPRECATION')} ${chalk_1.default.yellow('length')} was passed in without a corresponding ${chalk_1.default.yellow('maxSize')}. Both are now required as of lru-cache@7.0.0.`);
        delete opts.length;
    }
    const deprecations = new Map([
        ['stale', 'allowStale'],
        ['maxAge', 'ttl'],
        ['length', 'sizeCalculation'],
    ]);
    deprecations.forEach((newProp, oldProp) => {
        if (opts.hasOwnProperty(oldProp) && !opts.hasOwnProperty(newProp)) {
            winston.warn(`[cache/init($name)] ${chalk_1.default.white.bgRed.bold('DEPRECATION')} The option ${chalk_1.default.yellow(oldProp)} has been deprecated as of lru-cache@7.0.0. Please change this to ${chalk_1.default.yellow(newProp)} instead.`);
            opts[newProp] = opts[oldProp];
            delete opts[oldProp];
        }
    });
    const lruCache = new lru_cache_1.default(opts);
    const cache = {
        name: 'Cache',
        hits: 0,
        misses: 0,
        enabled: true,
        set(key, value, ttl) {
            if (!cache.enabled) {
                return;
            }
            if (ttl !== undefined) {
                opts[ttl] = ttl;
            }
            lruCache.set(key, value, opts);
        },
        get(key) {
            if (!cache.enabled) {
                return undefined;
            }
            const data = lruCache.get(key);
            if (data === undefined) {
                cache.misses += 1;
            }
            else {
                cache.hits += 1;
            }
            return data;
        },
        del(keys) {
            if (!Array.isArray(keys)) {
                keys = [keys];
            }
            pubsub_1.default.publish(`$cache:lruCache:del`, keys);
            keys.forEach((key) => lruCache.delete(key));
        },
        reset() {
            pubsub_1.default.publish(`${cache.name}:lruCache:reset`);
            lruCache.clear();
            cache.hits = 0;
            cache.misses = 0;
        },
        clear() {
            cache.reset();
        },
        getUnCachedKeys(keys, cachedData) {
            if (!cache.enabled) {
                return keys;
            }
            let data;
            let isCached;
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
        peek(key) {
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
    propertyMap.forEach((lruProp, cacheProp) => {
        Object.defineProperty(cache, cacheProp, {
            get: function () {
                return String(lruCache[lruProp]);
            },
            configurable: true,
            enumerable: true,
        });
    });
    pubsub_1.default.on(`${cache.name}:lruCache:reset`, () => {
        localReset();
    });
    pubsub_1.default.on(`${cache.name}:lruCache:del`, (keys) => {
        if (Array.isArray(keys)) {
            keys.forEach(key => lruCache.delete(key));
        }
    });
    return cache;
}
module.exports = createLRUCache;
