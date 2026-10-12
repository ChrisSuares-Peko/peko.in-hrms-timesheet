// PROTOTYPE-SETUP: ESS Service 1 (V2) — loads the months the three-month calendar shows (previous, current,
// next around the cursor). Each month is fetched once and kept; `reloadKey` refetches them all (after an entry,
// submit or change request, so the week colours update).
import { useEffect, useRef, useState } from 'react';

import { addMonths } from '@src/prototype/rules/attendance';

import type { TimesheetMonthView } from '../types';

export const calendarMonths = (middle: string) => [-1, 0, 1].map(n => addMonths(middle, n));

export const useCalendarMonths = (
    middle: string,
    loadMonth: (month: string) => Promise<TimesheetMonthView | false>,
    reloadKey: number
) => {
    const [months, setMonths] = useState<Record<string, TimesheetMonthView>>({});
    const loader = useRef(loadMonth);
    loader.current = loadMonth;
    const loadedKey = useRef(reloadKey);

    useEffect(() => {
        let alive = true;
        const stale = loadedKey.current !== reloadKey;
        loadedKey.current = reloadKey;
        // After a change every shown month is refetched; otherwise only months not loaded yet.
        const wanted = calendarMonths(middle).filter(m => stale || !months[m]);
        if (!wanted.length) return undefined;
        Promise.all(wanted.map(m => loader.current(m))).then(results => {
            if (!alive) return;
            setMonths(prev => {
                // After a change, months outside the three shown are dropped (they'd be stale) and refetched later.
                const next = stale ? {} : { ...prev };
                results.forEach((r, i) => {
                    if (r) next[wanted[i]] = r;
                });
                return next;
            });
        });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [middle, reloadKey]);

    return months;
};

export default useCalendarMonths;
