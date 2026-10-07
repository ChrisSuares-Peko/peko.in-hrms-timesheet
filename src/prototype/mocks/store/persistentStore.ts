// PROTOTYPE-SETUP: stateful mock data. A collection is seeded on first read (per data mode), kept in memory,
// and persisted to localStorage so an action taken in one sidebar tab (e.g. ESS - Employee submits a week)
// is visible in the others (ESS - Manager, Payroll) and survives a reload. A `storage` listener drops the
// cache when another browser tab writes, so open tabs stay in sync too.
// Keys: `prototype:<collection>:<mode>:v1`. "Reset demo data" clears every prototype key (both modes).
import type { DataMode } from '../envelope';

const PREFIX = 'prototype:';
// Bump when seeds change shape or coverage, so stale browser data reseeds (v2: seed back to last month's start).
const VERSION = 'v2';

const keyFor = (name: string, mode: DataMode) => `${PREFIX}${name}:${mode}:${VERSION}`;

const cache = new Map<string, unknown>();

const safeStorage = (): Storage | null => {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
        return null;
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('storage', event => {
        if (event.key === null) cache.clear();
        else if (event.key.startsWith(PREFIX)) cache.delete(event.key);
    });
}

export interface PersistentCollection<T> {
    get: (mode: DataMode) => T;
    set: (mode: DataMode, value: T) => void;
    /** Read-modify-write; returns the new value. */
    update: (mode: DataMode, fn: (current: T) => T) => T;
}

export const createCollection = <T>(
    name: string,
    seed: (mode: DataMode) => T
): PersistentCollection<T> => {
    const write = (mode: DataMode, value: T) => {
        const key = keyFor(name, mode);
        cache.set(key, value);
        try {
            safeStorage()?.setItem(key, JSON.stringify(value));
        } catch {
            // storage full or blocked — the in-memory copy still serves this session
        }
    };

    const read = (mode: DataMode): T => {
        const key = keyFor(name, mode);
        if (cache.has(key)) return cache.get(key) as T;
        let value: T | undefined;
        try {
            const stored = safeStorage()?.getItem(key);
            if (stored) value = JSON.parse(stored) as T;
        } catch {
            value = undefined; // unreadable / corrupt — reseed below
        }
        if (value === undefined) {
            value = seed(mode);
            write(mode, value);
        }
        cache.set(key, value);
        return value;
    };

    return {
        get: read,
        set: write,
        update: (mode, fn) => {
            const next = fn(read(mode));
            write(mode, next);
            return next;
        },
    };
};

/** "Reset demo data": forget every stateful collection in both modes; next reads reseed. */
export const resetAllCollections = () => {
    cache.clear();
    const storage = safeStorage();
    if (!storage) return;
    try {
        const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter(
            (k): k is string => !!k && k.startsWith(PREFIX)
        );
        keys.forEach(k => storage.removeItem(k));
    } catch {
        // nothing more to do
    }
};
