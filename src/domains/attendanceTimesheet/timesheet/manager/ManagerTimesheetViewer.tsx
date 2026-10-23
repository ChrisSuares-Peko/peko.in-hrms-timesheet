// PROTOTYPE-SETUP: ESS Service 1 (V2) — ESS - Manager copy. The manager's read-only viewer and review use these
// frozen components; the employee's Timesheet tab is redesigned separately (../). Only the entry shape changes here.
// PROTOTYPE-SETUP: ESS Service 1, Slice 4/6 — read-only Day / Week / Month timesheet viewer. Used by ESS -
// Manager to look at a direct report's timesheet. Same building blocks as the employee's Timesheet tab
// (ManagerTimesheetFrame, ManagerDayView, ManagerWeekView, ManagerMonthView…) so both look identical; no editing here.
import type { ReactNode } from 'react';

import ManagerTimesheetFrame from './ManagerTimesheetFrame';
import { useManagerTimesheetNav } from './useManagerTimesheetNav';
import type { TimesheetMonthView, TimesheetWeekView } from '../../types';

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

const ManagerTimesheetViewer = ({ loadWeek, loadMonth, initialDate, weekActions, reloadKey }: TimesheetViewerProps) => {
    const nav = useManagerTimesheetNav({ loadWeek, loadMonth, initialDate, reloadKey });
    const { view } = nav;

    return (
        <ManagerTimesheetFrame
            nav={nav}
            perspective="manager"
            weekActions={view && weekActions ? weekActions(view) : undefined}
        />
    );
};

export default ManagerTimesheetViewer;
