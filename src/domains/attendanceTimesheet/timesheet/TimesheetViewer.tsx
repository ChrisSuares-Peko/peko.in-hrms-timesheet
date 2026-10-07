// PROTOTYPE-SETUP: ESS Service 1, Slice 4/6 — read-only Day / Week / Month timesheet viewer. Used by ESS -
// Manager to look at a direct report's timesheet. Same building blocks as the employee's Timesheet tab
// (TimesheetFrame, DayView, WeekView, MonthView…) so both look identical; no editing here.
import type { ReactNode } from 'react';

import type { TimesheetMonthView, TimesheetWeekView } from '../types';
import ChangeRequestPanel from './ChangeRequestPanel';
import TimesheetFrame from './TimesheetFrame';
import { useTimesheetNav } from './useTimesheetNav';

export interface TimesheetViewerProps {
    /** The week containing `date` (YYYY-MM-DD). */
    loadWeek: (date: string) => Promise<TimesheetWeekView | false>;
    /** A month (YYYY-MM). */
    loadMonth: (month: string) => Promise<TimesheetMonthView | false>;
    /** Day to open on (default today). */
    initialDate?: string;
    /** Extra actions for the loaded week, rendered in the header — e.g. the manager's "Review and approve". */
    weekActions?: (view: TimesheetWeekView) => ReactNode;
    /** Change it to make the viewer reload (e.g. after a decision). */
    reloadKey?: number;
}

const TimesheetViewer = ({ loadWeek, loadMonth, initialDate, weekActions, reloadKey }: TimesheetViewerProps) => {
    const nav = useTimesheetNav({ loadWeek, loadMonth, initialDate, reloadKey });
    const { view } = nav;

    return (
        <TimesheetFrame
            nav={nav}
            perspective="manager"
            weekActions={view && weekActions ? weekActions(view) : undefined}
            notices={view?.changeRequest ? <ChangeRequestPanel cr={view.changeRequest} perspective="manager" /> : null}
        />
    );
};

export default TimesheetViewer;
