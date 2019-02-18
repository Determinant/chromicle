declare module 'lru-cache' {
    class LRUCache<K, V> {
        constructor(config: { max: number, dispose: (k: K, v: V) => any});
        get length(): number;
        has(key: K): boolean;
        get(key: K): V;
        set(key: K, val: V);
        dump(): {k: K, v: V, e: number}[];
        load(arr: {k: K, v: V, e: number}[]);
    }
    export = LRUCache;
}
