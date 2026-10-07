// PROTOTYPE-SETUP: ESS Service 1 — the layout shared by the employee's Timesheet tab and the read-only viewer:
// toolbar (Day / Week / Month, prev / next, Today), the week's status bar and notices, the main view, and the
// side column (Unlogged hours, History) — right on web, below on mobile. Editing is passed in by the tab.
import type { ReactNode } from 'react';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Empty, Segmented, Skeleton } from 'antd';

import { addDays, monthLabel, weekStartOf } from '@src/prototype/rules/attendance';

import { fmtWeekRange } from '../components/format';
import type { TimesheetDay } from '../types';
import DayStrip from './DayStrip';
import DayView, { DayEditHandlers } from './DayView';
import type { EntryMark } from './EntryRow';
import { TimesheetPerspective, TimesheetViewMode } from './helpers';
import MonthView from './MonthView';
import UnloggedCard, { UnloggedItem } from './UnloggedCard';
import type { TimesheetNav } from './useTimesheetNav';
import { WeekNotices, WeekStatusBar } from './WeekHeader';
import WeekHistory from './WeekHistory';
import WeekView from './WeekView';

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
    /** Extra notices under the week bar (change request, draft bar…). */
    notices?: ReactNode;
}

const Panel = ({ children }: { children: ReactNode }) => (
    <div className="rounded-xl border border-solid border-gray-200 bg-white p-3">{children}</div>
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

const TimesheetFrame = ({
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
    const modeOptions = [
        { label: 'Day', value: 'day' },
        ...(nav.isMobile ? [] : [{ label: 'Week', value: 'week' }]),
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
    if (!isMonth) {
        periodLabel =
            nav.weekStart === weekStartOf(today) ? 'this week' : `in ${fmtWeekRange(nav.weekStart)}`;
    }

    const selectedDay = days.find(d => d.date === nav.date);
    const atsMode = view?.mode ?? 'both';

    let main: ReactNode = null;
    if (isMonth) {
        if (nav.monthView) {
            main = (
                <MonthView
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
        main = <LoadError what="this week" onRetry={nav.reload} />;
    } else if (weekLoading) {
        main = (
            <Panel>
                <Skeleton active paragraph={{ rows: mode === 'week' ? 10 : 5 }} />
            </Panel>
        );
    } else if (mode === 'week') {
        main = (
            <WeekView
                days={days}
                today={today}
                atsMode={atsMode}
                edit={edit}
                marks={marks}
                perspective={perspective}
                onFlagAction={onFlagAction}
                onOpenDay={nav.openDay}
            />
        );
    } else {
        main = (
            <div className="flex min-w-0 flex-col gap-2.5">
                <DayStrip
                    days={days}
                    selected={nav.date}
                    today={today}
                    onSelect={nav.setDate}
                    onPrevWeek={() => nav.setDate(d => addDays(d, -7))}
                    onNextWeek={() => nav.setDate(d => addDays(d, 7))}
                />
                {selectedDay && (
                    <DayView
                        key={selectedDay.date}
                        day={selectedDay}
                        today={today}
                        atsMode={atsMode}
                        edit={edit}
                        marks={marks}
                        perspective={perspective}
                        onFlagAction={onFlagAction}
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
                    <UnloggedCard
                        periodLabel={periodLabel}
                        items={unlogged}
                        loading={isMonth ? !nav.monthView && nav.monthState === 'loading' : weekLoading}
                        onOpenDay={nav.openDay}
                        perspective={perspective}
                    />
                    {!isMonth && view && <WeekHistory history={view.week.history} />}
                </div>
            </div>
        </div>
    );
};

export default TimesheetFrame;
