// PROTOTYPE-SETUP: ESS Service 1 (V2) — ESS - Manager copy. The manager's read-only viewer and review use these
// frozen components; the employee's Timesheet tab is redesigned separately (../). Only the entry shape changes here.
// PROTOTYPE-SETUP: ESS Service 1 — navigation + loading for the timesheet tab and viewer: the selected date and
// view (Day / Week / Month; Week falls back to Day on mobile), the week containing that date, and the month
// when the Month view is open. Stale responses are ignored.
// PROTOTYPE-SETUP (Timesheet filing): what is loaded is the filing period containing the date (a day, a week or a
// month, per the company's frequency) — the unit that is submitted and approved. It loads once per period, the
// middle view steps by period, and the label is the period's ("12–18 Oct 2026", "October 2026").
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Grid } from 'antd';
import dayjs from 'dayjs';

import { addDays, addMonths, monthLabel, monthOf, weekStartOf } from '@src/prototype/rules/attendance';
import { periodEndOf } from '@src/prototype/rules/timesheetFiling';

import { TimesheetViewMode, todayIso } from './managerHelpers';
import { fmtWeekRange } from '../../components/format';
import type { TimesheetMonthView, TimesheetWeekView } from '../../types';

export type LoadState = 'loading' | 'ready' | 'error';

export interface UseTimesheetNavInput {
    loadWeek: (date: string) => Promise<TimesheetWeekView | false>;
    loadMonth: (month: string) => Promise<TimesheetMonthView | false>;
    initialDate?: string;
    reloadKey?: number;
}

export const useManagerTimesheetNav = ({ loadWeek, loadMonth, initialDate, reloadKey }: UseTimesheetNavInput) => {
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

    /** The loaded period covers the date: no new request (unless reloading). */
    const coveredStart = week && week.week.weekStart <= date && periodEndOf(week.week) >= date ? week.week.weekStart : null;
    const seen = useRef({ reloadKey, nonce });
    useEffect(() => {
        const forced = seen.current.reloadKey !== reloadKey || seen.current.nonce !== nonce;
        seen.current = { reloadKey, nonce };
        if (coveredStart && !forced) return undefined;
        let alive = true;
        setWeekState('loading');
        loaders.current.loadWeek(date).then(res => {
            if (!alive) return;
            if (res) setWeek(res);
            setWeekState(res ? 'ready' : 'error');
        });
        return () => {
            alive = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coveredStart ?? date, reloadKey, nonce]);

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
            else if (viewMode === 'week' && week && coveredStart) setDate(dir > 0 ? addDays(periodEndOf(week.week), 1) : addDays(week.week.weekStart, -1));
            else if (viewMode === 'week') setDate(d => addDays(d, 7 * dir));
            else {
                const m = addMonths(monthOf(date), dir);
                setDate(m === monthOf(today) ? today : `${m}-01`);
            }
        },
        [viewMode, date, today, week, coveredStart]
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

    /** The loaded filing period, only once it is the period of the selected date. */
    const view = coveredStart ? week : null;

    let label = monthLabel(month);
    if (viewMode === 'day') label = dayjs(date).format('ddd, D MMM YYYY');
    if (viewMode === 'week') label = view ? view.filing.period.label : fmtWeekRange(weekStart);

    let isCurrent = month === monthOf(today);
    if (viewMode === 'day') isCurrent = date === today;
    if (viewMode === 'week') isCurrent = view ? view.week.weekStart <= today && periodEndOf(view.week) >= today : weekStart === weekStartOf(today);
    const monthData = monthView && monthView.month === month ? monthView : null;

    return {
        today,
        isMobile,
        date,
        setDate,
        mode: viewMode,
        setMode,
        /** The filing period's first day (the date's Monday until it's loaded). */
        weekStart: view?.week.weekStart ?? weekStart,
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

export type TimesheetNav = ReturnType<typeof useManagerTimesheetNav>;

export default useManagerTimesheetNav;
