// PROTOTYPE-SETUP: ESS Service 1 — the Week view (web only): the seven days as DayView cards on one shared
// time scale, so the tracks line up. Clicking a date opens it in the Day view.
import type { AtsMode, TimesheetDay } from '../types';
import DayView, { DayEditHandlers } from './DayView';
import type { EntryMark } from './EntryRow';
import { TimesheetPerspective, trackRange } from './helpers';

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

const WeekView = ({ days, today, atsMode, edit, marks, perspective, onFlagAction, onOpenDay }: WeekViewProps) => {
    const range = trackRange(days);
    return (
        <div className="flex min-w-0 flex-col gap-2.5">
            {days.map(day => (
                <DayView
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

export default WeekView;
