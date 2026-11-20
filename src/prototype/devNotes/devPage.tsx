// PROTOTYPE-SETUP (Developer notes): which page the developer is on, so the notes panel follows them.
//   DevPageProvider ... holds the current page key ("ess:leave:overview", "pay:settings:leave:types", …)
//   useDevPage(key) ... every page or sub-tab reports its key. Only the innermost component of a page sets one; a
//                       parent passes null where a child sets it, so a parent never overwrites a child. On unmount the
//                       key is cleared (if it's still ours), so a page without a key shows the panel's empty state.
// No notes data lives here: this is a key in React state. With the prototype flag off nothing reads it.
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type SetKey = (update: (current: string | null) => string | null) => void;

const SetDevPage = createContext<SetKey>(() => {});
const DevPageKey = createContext<string | null>(null);

export const DevPageProvider = ({ children }: { children: ReactNode }) => {
    const [key, setKey] = useState<string | null>(null);
    // Two contexts: pages only read the (stable) setter, so a key change re-renders only the notes panel.
    const set = useMemo<SetKey>(() => update => setKey(update), []);
    return (
        <SetDevPage.Provider value={set}>
            <DevPageKey.Provider value={key}>{children}</DevPageKey.Provider>
        </SetDevPage.Provider>
    );
};

/** Report this page's notes key (null: a child component sets it). */
export const useDevPage = (key: string | null) => {
    const set = useContext(SetDevPage);
    useEffect(() => {
        if (!key) return undefined;
        set(() => key);
        return () => set(current => (current === key ? null : current));
    }, [key, set]);
};

/** The current page's key (the notes panel). */
export const useCurrentDevPage = () => useContext(DevPageKey);
