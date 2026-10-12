// PROTOTYPE-SETUP: ESS Service 1 (V2) — navigation + loading for the employee's Timesheet tab, as in the
// prototype: a cursor date, the view (Day / Week / Month — Week by default, also on mobile), and `selected`, the
// day whose entries panel is open in Week / Month view. Every week the period touches is loaded (Month view needs
// all its weeks' day rows) and kept per week, so an edit anywhere updates the right week. Stale responses are
// ignored. The three-month calendar picks a day (pick), shifts by a month (shiftMonths) and jumps to today.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Grid } from 'antd';
import dayjs from 'dayjs';

import { addDays, addMonths, monthLabel, monthOf, weekStartOf, weeksOverlappingMonth } from '@src/prototype/rules/attendance';

import { fmtWeekRange } from '../components/format';
import type { TimesheetDay, TimesheetWeekView } from '../types';
import { TimesheetViewMode, todayIso } from './helpers';

export type LoadState = 'loading' | 'ready' | 'error';

export interface UseTimesheetNavInput {
    loadWeek: (date: string) => Promise<TimesheetWeekView | false>;
    initialDate?: string;
}

/** Days that get a row: working days, plus weekends / holidays with attendance or logged time. */
export const isListedDay = (d: TimesheetDay, dateOfJoin: string) =>
    d.date >= dateOfJoin &&
    (!['holiday', 'weekly-off'].includes(d.attendance.status) || d.entries.length > 0 || Boolean(d.attendance.checkIn));

export const useTimesheetNav = ({ loadWeek, initialDate }: UseTimesheetNavInput) => {
    const today = useMemo(todayIso, []);
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;

    const [date, setDate] = useState(initialDate ?? today);
    const [mode, setMode] = useState<TimesheetViewMode>('week');
    /** Week / Month view: the day whose entries panel is open (null = none). Day view always shows its day. */
    // PROTOTYPE-SETUP (Overview, Slice 2): a deep link (?date=) opens that day.
    const [selected, setSelected] = useState<string | null>(initialDate ?? null);
    const [weeks, setWeeks] = useState<Record<string, TimesheetWeekView>>({});
    const [state, setState] = useState<LoadState>('loading');
    const [nonce, setNonce] = useState(0);

    const month = monthOf(date);
    const weekStart = weekStartOf(date);
    /** The week in focus (status card, history): the open day's week, else the cursor's. */
    const focusDate = mode === 'day' ? date : selected ?? date;
    const focusWeekStart = weekStartOf(focusDate);
    const periodWeeks = useMemo(
        () => (mode === 'month' ? weeksOverlappingMonth(month) : [weekStart]),
        [mode, month, weekStart]
    );

    const loader = useRef(loadWeek);
    loader.current = loadWeek;
    const loadedNonce = useRef(nonce);

    useEffect(() => {
        let alive = true;
        const stale = loadedNonce.current !== nonce;
        loadedNonce.current = nonce;
        const wanted = [...new Set([...periodWeeks, focusWeekStart])].filter(ws => stale || !weeks[ws]);
        if (!wanted.length) {
            setState('ready');
            return undefined;
        }
        setState('loading');
        Promise.all(wanted.map(ws => loader.current(ws))).then(results => {
            if (!alive) return;
            setWeeks(prev => {
                const next = stale ? {} : { ...prev };
                results.forEach((r, i) => {
                    if (r) next[wanted[i]] = r;
                });
                return next;
            });
            setState(results.every(Boolean) ? 'ready' : 'error');
        });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodWeeks, focusWeekStart, nonce]);

    /** Replace one week (after an edit / submit / change request). */
    const setWeek = useCallback((v: TimesheetWeekView) => setWeeks(prev => ({ ...prev, [v.week.weekStart]: v })), []);

    const step = useCallback(
        (dir: 1 | -1) => {
            setSelected(null);
            if (mode === 'day') setDate(d => addDays(d, dir));
            else if (mode === 'week') setDate(d => addDays(d, 7 * dir));
            else {
                const m = addMonths(monthOf(date), dir);
                setDate(m === monthOf(today) ? today : `${m}-01`);
            }
        },
        [mode, date, today]
    );

    /** Calendar click: load the date in the current view; in Week / Month view, open that day's entries. */
    const pick = useCallback(
        (d: string) => {
            setDate(d);
            setSelected(mode === 'day' ? null : d);
        },
        [mode]
    );

    /** Calendar arrows: move the three months by one (cursor to the 1st of the new middle month). */
    const shiftMonths = useCallback(
        (dir: 1 | -1) => {
            setDate(`${addMonths(monthOf(date), dir)}-01`);
            setSelected(null);
        },
        [date]
    );

    /** Switch view; going to Day view shows the open day (or the cursor). */
    const changeMode = useCallback(
        (next: TimesheetViewMode) => {
            if (next === 'day') {
                if (selected) setDate(selected);
                setSelected(null);
            }
            setMode(next);
        },
        [selected]
    );

    /** Row click in Week / Month view: open the day, or close it if it's already open. */
    const toggleDay = useCallback((d: string) => setSelected(s => (s === d ? null : d)), []);

    let label = monthLabel(month);
    if (mode === 'day') label = dayjs(date).format('dddd, D MMMM YYYY');
    if (mode === 'week') label = fmtWeekRange(weekStart);

    const focusWeek = weeks[focusWeekStart] ?? null;
    const loadedWeeks = periodWeeks.map(ws => weeks[ws]).filter((w): w is TimesheetWeekView => Boolean(w));
    const periodReady = loadedWeeks.length === periodWeeks.length;

    return {
        today,
        isMobile,
        date,
        setDate,
        mode,
        changeMode,
        month,
        weekStart,
        selected,
        focusDate,
        focusWeekStart,
        focusWeek,
        weeks,
        periodWeeks: loadedWeeks,
        periodReady,
        state,
        setWeek,
        reload: useCallback(() => setNonce(n => n + 1), []),
        step,
        pick,
        shiftMonths,
        toggleDay,
        goToday: useCallback(() => {
            setDate(today);
            setSelected(mode === 'day' ? null : today);
        }, [today, mode]),
        label,
    };
};

export type TimesheetNav = ReturnType<typeof useTimesheetNav>;

export default useTimesheetNav;
