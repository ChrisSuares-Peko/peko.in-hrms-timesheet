// PROTOTYPE-SETUP: ESS Service 1 — navigation + loading for the timesheet tab and viewer: the selected date and
// view (Day / Week / Month; Week falls back to Day on mobile), the week containing that date, and the month
// when the Month view is open. Stale responses are ignored.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Grid } from 'antd';
import dayjs from 'dayjs';

import { addDays, addMonths, monthLabel, monthOf, weekStartOf } from '@src/prototype/rules/attendance';

import { fmtWeekRange } from '../components/format';
import type { TimesheetMonthView, TimesheetWeekView } from '../types';
import { TimesheetViewMode, todayIso } from './helpers';

export type LoadState = 'loading' | 'ready' | 'error';

export interface UseTimesheetNavInput {
    loadWeek: (date: string) => Promise<TimesheetWeekView | false>;
    loadMonth: (month: string) => Promise<TimesheetMonthView | false>;
    initialDate?: string;
    reloadKey?: number;
}

export const useTimesheetNav = ({ loadWeek, loadMonth, initialDate, reloadKey }: UseTimesheetNavInput) => {
    const today = useMemo(todayIso, []);
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;

    const [date, setDate] = useState(initialDate ?? today);
    const [mode, setMode] = useState<TimesheetViewMode>('week');
    const viewMode: TimesheetViewMode = isMobile && mode === 'week' ? 'day' : mode;
    const weekStart = weekStartOf(date);
    const month = monthOf(date);

    const [week, setWeek] = useState<TimesheetWeekView | null>(null);
    const [weekState, setWeekState] = useState<LoadState>('loading');
    const [monthView, setMonthView] = useState<TimesheetMonthView | null>(null);
    const [monthState, setMonthState] = useState<LoadState>('loading');
    const [nonce, setNonce] = useState(0);

    const loaders = useRef({ loadWeek, loadMonth });
    loaders.current = { loadWeek, loadMonth };

    useEffect(() => {
        if (initialDate) setDate(initialDate);
    }, [initialDate]);

    useEffect(() => {
        let alive = true;
        setWeekState('loading');
        loaders.current.loadWeek(weekStart).then(res => {
            if (!alive) return;
            if (res) setWeek(res);
            setWeekState(res ? 'ready' : 'error');
        });
        return () => {
            alive = false;
        };
    }, [weekStart, reloadKey, nonce]);

    useEffect(() => {
        if (viewMode !== 'month') return undefined;
        let alive = true;
        setMonthState('loading');
        loaders.current.loadMonth(month).then(res => {
            if (!alive) return;
            if (res) setMonthView(res);
            setMonthState(res ? 'ready' : 'error');
        });
        return () => {
            alive = false;
        };
    }, [viewMode, month, reloadKey, nonce]);

    const step = useCallback(
        (dir: 1 | -1) => {
            if (viewMode === 'day') setDate(d => addDays(d, dir));
            else if (viewMode === 'week') setDate(d => addDays(d, 7 * dir));
            else {
                const m = addMonths(monthOf(date), dir);
                setDate(m === monthOf(today) ? today : `${m}-01`);
            }
        },
        [viewMode, date, today]
    );

    const openDay = useCallback((d: string) => {
        setDate(d);
        setMode('day');
    }, []);

    const openWeek = useCallback(
        (ws: string) => {
            setDate(weekStartOf(today) === ws ? today : ws);
            setMode('week');
        },
        [today]
    );

    let label = monthLabel(month);
    if (viewMode === 'day') label = dayjs(date).format('ddd, D MMM YYYY');
    if (viewMode === 'week') label = fmtWeekRange(weekStart);

    let isCurrent = month === monthOf(today);
    if (viewMode === 'day') isCurrent = date === today;
    if (viewMode === 'week') isCurrent = weekStart === weekStartOf(today);

    /** The loaded week, only once it is the week of the selected date. */
    const view = week && week.week.weekStart === weekStart ? week : null;
    const monthData = monthView && monthView.month === month ? monthView : null;

    return {
        today,
        isMobile,
        date,
        setDate,
        mode: viewMode,
        setMode,
        weekStart,
        month,
        view,
        weekState,
        setWeek,
        monthView: monthData,
        monthState,
        reload: useCallback(() => setNonce(n => n + 1), []),
        step,
        goToday: useCallback(() => setDate(today), [today]),
        openDay,
        openWeek,
        label,
        isCurrent,
    };
};

export type TimesheetNav = ReturnType<typeof useTimesheetNav>;

export default useTimesheetNav;
