// PROTOTYPE-SETUP: ESS Service 1 (V2) — navigation + loading for the employee's Timesheet tab, as in the
// prototype: a cursor date, the view (Day / Week / Month — Week by default, also on mobile), and `selected`, the
// day whose entries panel is open in Week / Month view. Stale responses are ignored. The three-month calendar picks a
// day (pick), shifts by a month (shiftMonths) and jumps to today.
// PROTOTYPE-SETUP (Timesheet filing): what is loaded is the company's filing periods (a day, a week or a month) that
// cover the visible days — one request for the range — kept per period start, so an edit anywhere updates the right
// period. The view starts at the frequency's own size (daily → Day, monthly → Month), and stepPeriod moves to the
// previous / next filing period.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Grid } from 'antd';
import dayjs from 'dayjs';

import { addDays, addMonths, monthBounds, monthLabel, monthOf, weekStartOf } from '@src/prototype/rules/attendance';
import { periodEndOf } from '@src/prototype/rules/timesheetFiling';

import { fmtWeekRange } from '../components/format';
import type { FilingFrequency, TimesheetDay, TimesheetWeekView } from '../types';
import { TimesheetViewMode, todayIso } from './helpers';

export type LoadState = 'loading' | 'ready' | 'error';

export interface UseTimesheetNavInput {
    /** The filing periods overlapping from → to. */
    loadRange: (from: string, to: string) => Promise<TimesheetWeekView[] | false>;
    initialDate?: string;
    /** The company's filing frequency, once known: the first view matches it (unless a day was deep-linked). */
    frequency?: FilingFrequency;
}

/** Days that get a row: working days, plus weekends / holidays with attendance or logged time. */
// PROTOTYPE-SETUP (Leave & team, Slice 1): leave and public-holiday days are always listed (their rows fill the shift).
export const isListedDay = (d: TimesheetDay, dateOfJoin: string) =>
    d.date >= dateOfJoin &&
    (!['holiday', 'weekly-off'].includes(d.attendance.status) || d.entries.length > 0 || Boolean(d.attendance.checkIn) || (d.leaveRows?.length ?? 0) > 0);

const VIEW_FOR: Record<FilingFrequency, TimesheetViewMode> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' };

const covers = (v: TimesheetWeekView, date: string) => v.week.weekStart <= date && periodEndOf(v.week) >= date;

export const useTimesheetNav = ({ loadRange, initialDate, frequency }: UseTimesheetNavInput) => {
    const today = useMemo(todayIso, []);
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;

    const [date, setDate] = useState(initialDate ?? today);
    const [mode, setMode] = useState<TimesheetViewMode>('week');
    /** Week / Month view: the day whose entries panel is open (null = none). Day view always shows its day. */
    // PROTOTYPE-SETUP (Overview, Slice 2): a deep link (?date=) opens that day.
    const [selected, setSelected] = useState<string | null>(initialDate ?? null);
    /** Loaded filing periods by their first day. */
    const [weeks, setWeeks] = useState<Record<string, TimesheetWeekView>>({});
    const [state, setState] = useState<LoadState>('loading');
    const [nonce, setNonce] = useState(0);

    // The first view matches the filing frequency (a deep link keeps Week view with that day open).
    const sized = useRef(false);
    useEffect(() => {
        if (!frequency || sized.current) return;
        sized.current = true;
        if (!initialDate) setMode(VIEW_FOR[frequency]);
    }, [frequency, initialDate]);

    const month = monthOf(date);
    const weekStart = weekStartOf(date);
    /** The day in focus (its filing period's status card, history): the open day, else the cursor. */
    const focusDate = mode === 'day' ? date : selected ?? date;
    const [from, to] = useMemo((): [string, string] => {
        if (mode === 'day') return [date, date];
        if (mode === 'week') return [weekStart, addDays(weekStart, 6)];
        const { first, last } = monthBounds(month);
        return [first, last];
    }, [mode, date, weekStart, month]);

    const viewFor = useCallback((d: string) => Object.values(weeks).find(v => covers(v, d)) ?? null, [weeks]);

    const loader = useRef(loadRange);
    loader.current = loadRange;
    const loadedNonce = useRef(nonce);

    useEffect(() => {
        let alive = true;
        const stale = loadedNonce.current !== nonce;
        loadedNonce.current = nonce;
        const lo = focusDate < from ? focusDate : from;
        const hi = focusDate > to ? focusDate : to;
        const loaded = Object.values(weeks);
        const missing = (d: string) => !loaded.some(v => covers(v, d));
        let needed = stale;
        for (let d = lo; !needed && d <= hi; d = addDays(d, 1)) needed = missing(d);
        if (!needed) {
            setState('ready');
            return undefined;
        }
        setState('loading');
        loader.current(lo, hi).then(res => {
            if (!alive) return;
            if (res) {
                setWeeks(prev => {
                    const next = stale ? {} : { ...prev };
                    res.forEach(v => {
                        next[v.week.weekStart] = v;
                    });
                    return next;
                });
            }
            setState(res ? 'ready' : 'error');
        });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [from, to, focusDate, nonce]);

    /** Replace one period (after an edit or a submit). */
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

    const focusWeek = viewFor(focusDate);

    /** PROTOTYPE-SETUP (Timesheet filing): to the previous / next filing period (the day just before / after this one). */
    const stepPeriod = useCallback(
        (dir: 1 | -1) => {
            if (!focusWeek) return;
            const target = dir < 0 ? addDays(focusWeek.week.weekStart, -1) : addDays(periodEndOf(focusWeek.week), 1);
            setDate(target);
            setSelected(mode === 'day' ? null : target);
        },
        [focusWeek, mode]
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

    /** The loaded periods overlapping the visible days, in order. */
    const periodWeeks = useMemo(
        () =>
            Object.values(weeks)
                .filter(v => v.week.weekStart <= to && periodEndOf(v.week) >= from)
                .sort((a, b) => a.week.weekStart.localeCompare(b.week.weekStart)),
        [weeks, from, to]
    );
    const periodReady = useMemo(() => {
        for (let d = from; d <= to; d = addDays(d, 1)) if (!periodWeeks.some(v => covers(v, d))) return false;
        return true;
    }, [periodWeeks, from, to]);

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
        /** The focused filing period's first day (the cursor's Monday until it's loaded). */
        focusWeekStart: focusWeek?.week.weekStart ?? weekStart,
        focusWeek,
        weeks,
        viewFor,
        /** The visible days' range. */
        range: { from, to },
        periodWeeks,
        periodReady,
        state,
        setWeek,
        reload: useCallback(() => setNonce(n => n + 1), []),
        step,
        stepPeriod,
        pick,
        shiftMonths,
        toggleDay,
        /** PROTOTYPE-SETUP (Timesheet v6, Slice 3): Notices' "Go to day" — that day, in Day view. */
        openDay: useCallback((d: string) => {
            setMode('day');
            setDate(d);
            setSelected(null);
        }, []),
        goToday: useCallback(() => {
            setDate(today);
            setSelected(mode === 'day' ? null : today);
        }, [today, mode]),
        label,
    };
};

export type TimesheetNav = ReturnType<typeof useTimesheetNav>;

export default useTimesheetNav;
