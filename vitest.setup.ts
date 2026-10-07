/* eslint-disable @typescript-eslint/no-unused-vars */
// eslint-disable-next-line import/no-extraneous-dependencies
import '@testing-library/jest-dom';

globalThis.matchMedia =
    globalThis.matchMedia ||
    (() => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }));

// Mocking IntersectionObserver for tests
globalThis.IntersectionObserver =
    globalThis.IntersectionObserver ||
    class {
        observe() {
            // Using 'this' to satisfy eslint rule
            const self = this;
        }

        unobserve() {
            // Using 'this' to satisfy eslint rule
            const self = this;
        }

        disconnect() {
            // Using 'this' to satisfy eslint rule
            const self = this;
        }
    };

// PROTOTYPE-SETUP: Node 25 exposes its own global `localStorage` (a non-functional stub unless Node is started with
// --localstorage-file), which shadows jsdom's. Code that reads storage at import time (src/store/store.ts) then
// crashes. Give tests a working in-memory Storage when the global one is broken.
if (typeof window !== 'undefined' && typeof window.localStorage?.getItem !== 'function') {
    const data = new Map<string, string>();
    const memoryStorage: Storage = {
        get length() {
            return data.size;
        },
        clear: () => data.clear(),
        getItem: key => (data.has(key) ? data.get(key)! : null),
        key: index => [...data.keys()][index] ?? null,
        removeItem: key => {
            data.delete(key);
        },
        setItem: (key, value) => {
            data.set(key, String(value));
        },
    };
    Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
}
