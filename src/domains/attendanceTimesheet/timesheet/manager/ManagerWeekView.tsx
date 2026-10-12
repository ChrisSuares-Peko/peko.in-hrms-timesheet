// PROTOTYPE-SETUP: ESS Service 1 (V2) — ESS - Manager copy. The manager's read-only viewer and review use these
// frozen components; the employee's Timesheet tab is redesigned separately (../). Only the entry shape changes here.
// PROTOTYPE-SETUP: ESS Service 1 — the Week view (web only): the seven days as ManagerDayView cards on one shared
// time scale, so the tracks line up. Clicking a date opens it in the Day view.
import ManagerDayView, { DayEditHandlers } from './ManagerDayView';
import type { EntryMark } from './ManagerEntryRow';
import { TimesheetPerspective, trackRange } from './managerHelpers';
import type { AtsMode, TimesheetDay } from '../../types';

export interface WeekViewProps {
    days: TimesheetDay[];
    today: string;
    atsMode: AtsMode;
    edit?: DayEditHandlers;
    marks?: Map<string, EntryMark>;
    perspective?: TimesheetPerspective;
    onFlagAction?: (day: TimesheetDay) => void;
    onOpenDay?: (date: string) => void;
}

const ManagerWeekView = ({ days, today, atsMode, edit, marks, perspective, onFlagAction, onOpenDay }: WeekViewProps) => {
    const range = trackRange(days);
    return (
        <div className="flex min-w-0 flex-col gap-2.5">
            {days.map(day => (
                <ManagerDayView
                    key={day.date}
                    day={day}
                    today={today}
                    atsMode={atsMode}
                    range={range}
                    compact
                    edit={edit}
                    marks={marks}
                    perspective={perspective}
                    onFlagAction={onFlagAction}
                    onOpen={onOpenDay}
                />
            ))}
        </div>
    );
};

export default ManagerWeekView;
