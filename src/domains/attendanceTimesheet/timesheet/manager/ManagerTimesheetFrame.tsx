// PROTOTYPE-SETUP: ESS Service 1 (V2) — ESS - Manager copy. The manager's read-only viewer and review use these
// frozen components; the employee's Timesheet tab is redesigned separately (../). Only the entry shape changes here.
// PROTOTYPE-SETUP: ESS Service 1 — the layout shared by the employee's Timesheet tab and the read-only viewer:
// toolbar (Day / Week / Month, prev / next, Today), the week's status bar and notices, the main view, and the
// side column (Unlogged hours, History) — right on web, below on mobile. Editing is passed in by the tab.
import type { ReactNode } from 'react';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Empty, Segmented, Skeleton } from 'antd';

import { addDays, monthLabel } from '@src/prototype/rules/attendance';

import ManagerDayStrip from './ManagerDayStrip';
import ManagerDayView, { DayEditHandlers } from './ManagerDayView';
import type { EntryMark } from './ManagerEntryRow';
import { TimesheetPerspective, TimesheetViewMode } from './managerHelpers';
import ManagerMonthView from './ManagerMonthView';
import ManagerUnloggedCard, { UnloggedItem } from './ManagerUnloggedCard';
import { WeekNotices, WeekStatusBar } from './ManagerWeekHeader';
import ManagerWeekHistory from './ManagerWeekHistory';
import ManagerWeekView from './ManagerWeekView';
import type { TimesheetNav } from './useManagerTimesheetNav';
import type { TimesheetDay } from '../../types';

export interface TimesheetFrameProps {
    nav: TimesheetNav;
    perspective: TimesheetPerspective;
    /** Days to show instead of the loaded ones (change-request draft). */
    days?: TimesheetDay[];
    edit?: DayEditHandlers;
    marks?: Map<string, EntryMark>;
    onFlagAction?: (day: TimesheetDay) => void;
    /** Buttons in the week status bar. */
    weekActions?: ReactNode;
    /** Line under the week totals (overrides the default approval copy). */
    weekNote?: ReactNode;
    /** Extra notices under the week bar. */
    notices?: ReactNode;
}

const Panel = ({ children }: { children: ReactNode }) => (
    <div className="rounded-[26px] border border-solid border-[#e6e6e6] bg-white p-3">{children}</div>
);

const LoadError = ({ what, onRetry }: { what: string; onRetry: () => void }) => (
    <Panel>
        <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={`Couldn't load ${what}.`}
            className="!my-4"
        >
            <Button onClick={onRetry}>Try again</Button>
        </Empty>
    </Panel>
);

const ManagerTimesheetFrame = ({
    nav,
    perspective,
    days: daysOverride,
    edit,
    marks,
    onFlagAction,
    weekActions,
    weekNote,
    notices,
}: TimesheetFrameProps) => {
    const { view, mode, today } = nav;
    const days = daysOverride ?? view?.days ?? [];
    const weekLoading = !view && nav.weekState !== 'error';
    const isMonth = mode === 'month';
    // PROTOTYPE-SETUP (Timesheet filing): the middle view is the filing period ("Week" for weekly filing).
    const periodWord = !view || view.filing.frequency === 'WEEKLY' ? 'Week' : 'Period';
    const modeOptions = [
        { label: 'Day', value: 'day' },
        ...(nav.isMobile ? [] : [{ label: periodWord, value: 'week' }]),
        { label: 'Month', value: 'month' },
    ];

    const unlogged: UnloggedItem[] = isMonth
        ? (nav.monthView?.days ?? [])
              .filter(d => d.date < today && d.expectedMinutes > d.loggedMinutes)
              .map(d => ({
                  date: d.date,
                  loggedMinutes: d.loggedMinutes,
                  expectedMinutes: d.expectedMinutes,
                  unloggedMinutes: d.expectedMinutes - d.loggedMinutes,
              }))
        : days.filter(d => d.unloggedMinutes > 0);
    let periodLabel = `in ${monthLabel(nav.month)}`;
    if (!isMonth) periodLabel = view ? `in ${view.filing.period.label}` : 'in this period';

    const selectedDay = days.find(d => d.date === nav.date);
    const atsMode = view?.mode ?? 'both';

    let main: ReactNode = null;
    if (isMonth) {
        if (nav.monthView) {
            main = (
                <ManagerMonthView
                    month={nav.monthView}
                    today={today}
                    atsMode={atsMode}
                    selected={nav.date}
                    onOpenDay={nav.openDay}
                    onOpenWeek={nav.isMobile ? undefined : nav.openWeek}
                />
            );
        } else if (nav.monthState === 'error') {
            main = <LoadError what="this month" onRetry={nav.reload} />;
        } else {
            main = (
                <Panel>
                    <Skeleton active paragraph={{ rows: 8 }} />
                </Panel>
            );
        }
    } else if (nav.weekState === 'error' && !view) {
        main = <LoadError what="this timesheet" onRetry={nav.reload} />;
    } else if (weekLoading) {
        main = (
            <Panel>
                <Skeleton active paragraph={{ rows: mode === 'week' ? 10 : 5 }} />
            </Panel>
        );
    } else if (mode === 'week') {
        main = (
            <ManagerWeekView
                days={days}
                today={today}
                atsMode={atsMode}
                edit={edit}
                marks={marks}
                perspective={perspective}
                onFlagAction={onFlagAction}
                onOpenDay={nav.openDay}
                fields={view?.filing.fields}
            />
        );
    } else {
        main = (
            <div className="flex min-w-0 flex-col gap-2.5">
                <ManagerDayStrip
                    days={days}
                    selected={nav.date}
                    today={today}
                    onSelect={nav.setDate}
                    onPrevWeek={() => nav.setDate(d => addDays(d, -7))}
                    onNextWeek={() => nav.setDate(d => addDays(d, 7))}
                />
                {selectedDay && (
                    <ManagerDayView
                        key={selectedDay.date}
                        day={selectedDay}
                        today={today}
                        atsMode={atsMode}
                        edit={edit}
                        marks={marks}
                        perspective={perspective}
                        onFlagAction={onFlagAction}
                        fields={view?.filing.fields}
                    />
                )}
            </div>
        );
    }

    return (
        <div className="flex w-full min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <Segmented
                    options={modeOptions}
                    value={mode}
                    onChange={v => nav.setMode(v as TimesheetViewMode)}
                    aria-label="Timesheet view"
                />
                <div className="flex min-w-0 items-center gap-1">
                    <Button
                        icon={<LeftOutlined />}
                        aria-label={`Previous ${mode}`}
                        onClick={() => nav.step(-1)}
                    />
                    <span className="min-w-[96px] truncate px-1 text-center text-sm font-medium text-gray-900">
                        {nav.label}
                    </span>
                    <Button icon={<RightOutlined />} aria-label={`Next ${mode}`} onClick={() => nav.step(1)} />
                    <Button onClick={nav.goToday} disabled={nav.isCurrent} className="ml-1">
                        Today
                    </Button>
                </div>
            </div>

            {!isMonth && view && (
                <>
                    <WeekStatusBar view={view} perspective={perspective} actions={weekActions} note={weekNote} />
                    <WeekNotices view={view} perspective={perspective} />
                    {notices}
                </>
            )}

            <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="min-w-0">{main}</div>
                <div className="flex min-w-0 flex-col gap-3">
                    <ManagerUnloggedCard
                        periodLabel={periodLabel}
                        items={unlogged}
                        loading={isMonth ? !nav.monthView && nav.monthState === 'loading' : weekLoading}
                        onOpenDay={nav.openDay}
                        perspective={perspective}
                    />
                    {!isMonth && view && <ManagerWeekHistory history={view.week.history} />}
                </div>
            </div>
        </div>
    );
};

export default ManagerTimesheetFrame;
