// PROTOTYPE-SETUP: stateful mock data. A collection is seeded on first read (per data mode), kept in memory,
// and persisted to localStorage so an action taken in one sidebar tab (e.g. ESS - Employee submits a week)
// is visible in the others (ESS - Manager, Payroll) and survives a reload. A `storage` listener drops the
// cache when another browser tab writes, so open tabs stay in sync too.
// Keys: `prototype:<collection>:<mode>:<version>:<YYYY-MM-DD>`. "Reset demo data" clears every prototype key.
// PROTOTYPE-SETUP: the demo's "today" is the real current date. Seeds are built relative to it, so a collection
// belongs to the day it was seeded: on a new day the keys change, the old day's data is dropped and everything
// reseeds around the new today (otherwise data seeded on, say, the 7th would freeze the demo on the 7th).
import { toIsoDate } from '../data/dates';
import type { DataMode } from '../envelope';

const PREFIX = 'prototype:';
// Bump when seeds change shape or coverage, so stale browser data reseeds (v2: seed back to last month's start).
// v4 (V2): entries gained `mins` and may be hours-only — older saved data reseeds.
// PROTOTYPE-SETUP (HR rules, Slice 1): v5 — open sessions, outDays, breaks, next-day entries, Payroll level 2.
// PROTOTYPE-SETUP (Timesheet filing): v6 — filing settings (frequency, fields) and project codes on entries.
const VERSION = 'v6';

/** The day the demo data is built for — the real current date. */
export const demoDay = () => toIsoDate(new Date());

const keyFor = (name: string, mode: DataMode) => `${PREFIX}${name}:${mode}:${VERSION}:${demoDay()}`;

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

let checkedDay = '';

/** Once per day (and on first use): forget data seeded for another day or an older version. */
const dropStaleDays = () => {
    const day = demoDay();
    if (checkedDay === day) return;
    checkedDay = day;
    cache.clear();
    const storage = safeStorage();
    if (!storage) return;
    try {
        const suffix = `:${VERSION}:${day}`;
        Array.from({ length: storage.length }, (_, i) => storage.key(i))
            .filter((k): k is string => !!k && k.startsWith(PREFIX) && !k.endsWith(suffix))
            .forEach(k => storage.removeItem(k));
    } catch {
        // nothing more to do
    }
};

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
        dropStaleDays();
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
