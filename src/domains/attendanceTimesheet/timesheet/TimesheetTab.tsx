// PROTOTYPE-SETUP: ESS Service 1 — the employee's Timesheet tab (modes 'both' and 'timesheet'), V2 layout from
// docs/prototypes/attendance-timesheet.html:
//   1. top area  — three-month calendar (65%); the Notices panel (35%, same height, scrolls inside): the focused week,
//                  "Needs your action" across all weeks, unlogged hours, history (HR rules, Slice 3)
//   2. view bar  — Day / Week / Month, period arrows and label, "Logged X of Y worked" (Week view by default)
//   3. day rows  — a shared hour axis (past midnight when needed); per day the date, a meta line, the bar, the meter
//                  and the entries panel with the day's breaks (always open in Day view; one at a time in Week / Month).
// Entries can be timed or hours-only. PROTOTYPE-SETUP (Final batch, Slice 1): every change saves straight away (no
// draft copies, no change requests); editing a period that's with the manager, with Payroll or approved moves it back
// to Draft. 'both' mode flags time logged outside check-in hours and offers a correction;
// past days with extra time offer overtime.
// PROTOTYPE-SETUP (Timesheet filing): the status card is the company's filing period (day / week / month) with ‹ ›,
// a summary and its warnings. Submit (or Resubmit) runs the period's checks first (submissionPrompt): entries missing
// a required field stop it ("Review entries"); overlaps, then gaps over 5 minutes, warn ("Review entries" /
// "Continue anyway" / "Submit anyway"). The toast only shows once the server has accepted it; a second click can't
// submit twice. Automatic submission happens on the server and never shows these warnings.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { useAppDispatch } from '@src/hooks/store';
import { DEFAULT_SETTINGS } from '@src/prototype/rules/attendance';
import { PERIOD_NOUN, SubmissionAcknowledgement, SubmissionPrompt, periodKind, reviewPeriod, submissionPrompt } from '@src/prototype/rules/timesheetFiling';
import { showToast } from '@src/slices/apiSlice';

import {
    addEntry,
    deleteEntry,
    editEntry,
    getAtsSettings,
    getOvertime,
    getTimesheetMonth,
    getTimesheetNotices,
    getTimesheetPeriods,
    submitWeek,
    updateBreakDescription,
} from '../api';
import { dayOvertime } from './dayModel';
import CorrectionModal from '../components/CorrectionModal';
import OvertimeRequestModal from '../components/OvertimeRequestModal';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsTab, CorrectionTimes, FilingFrequency, OvertimeView, TimesheetDay, TimesheetNotices, TimesheetWeekView } from '../types';
import Calendar3, { inRangeFor } from './Calendar3';
import DayRows from './DayRows';
import EntriesPanel from './EntriesPanel';
import type { EntryFormValue } from './EntryForm';
import { DownloadModal, UploadModal } from './ImportModals';
import NoticesPanel from './NoticesPanel';
import SubmitReviewModal from './SubmitReviewModal';
import './timesheet.css';
import { useCalendarMonths } from './useCalendarMonths';
import { isListedDay, useTimesheetNav } from './useTimesheetNav';
import ViewBar from './ViewBar';
import ViewSubmitModal, { periodsToSubmit, submitKind } from './ViewSubmitModal';
import WeekStatusCard from './WeekStatusCard';

export interface TimesheetTabProps {
    /** Called after anything changes (entries, upload, submit, correction) so the section can refresh counts. */
    onChanged?: () => void;
    /** PROTOTYPE-SETUP (Overview, Slice 2): open on this day (Week view, the day's panel open). */
    initialDate?: string;
    /** PROTOTYPE-SETUP (HR rules, Slice 3): Notices' "Go to attendance" / "Review overtime" switch tabs. */
    onGoTab?: (tab: AtsTab) => void;
}

interface CorrectionTarget {
    date: string;
    initial: CorrectionTimes;
    current: CorrectionTimes & { open?: boolean };
}


const TimesheetTab = ({ onChanged, initialDate, onGoTab }: TimesheetTabProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const loadRange = useCallback((from: string, to: string) => getTimesheetPeriods(scope, from, to), [scope]);
    const loadMonth = useCallback((m: string) => getTimesheetMonth(scope, m), [scope]);
    const [frequency, setFrequency] = useState<FilingFrequency | undefined>();
    const nav = useTimesheetNav({ loadRange, initialDate, frequency });
    const { today, focusWeek, setWeek, reload } = nav;

    const [busy, setBusy] = useState(false);
    const [correction, setCorrection] = useState<CorrectionTarget | null>(null);
    const [overtimeAsk, setOvertimeAsk] = useState<{ date: string; minutes: number } | null>(null);
    /** Bumped after every change so the calendar colours and overtime refresh. */
    const [changeKey, setChangeKey] = useState(0);
    const [overtime, setOvertime] = useState<OvertimeView | null>(null);
    const [notices, setNotices] = useState<TimesheetNotices | null>(null);
    const [shift, setShift] = useState(DEFAULT_SETTINGS.shift);
    /** PROTOTYPE-SETUP (Timesheet filing): the submission warning showing, and what was acknowledged so far. */
    const [prompt, setPrompt] = useState<{ kind: Exclude<SubmissionPrompt, null>; ack: SubmissionAcknowledgement } | null>(null);
    /** "Review entries": the entries outlined in their day's panel. */
    const [highlight, setHighlight] = useState<Set<string>>(new Set());
    /** PROTOTYPE-SETUP (Final batch, Slice 3): the template / upload modals. */
    const [fileModal, setFileModal] = useState<'download' | 'upload' | null>(null);
    const submitting = useRef(false);
    /**
     * PROTOTYPE-SETUP (Timesheet v6, Slice 3): Submit in the view bar — the confirmation (the periods in scope), then the
     * queue of periods still to send (each runs its checks first; the head is the one being checked / sent).
     */
    const [viewSubmit, setViewSubmit] = useState<TimesheetWeekView[] | null>(null);
    const [queue, setQueue] = useState<TimesheetWeekView[]>([]);
    const sentKind = useRef<'changes' | 'full'>('full');

    useEffect(() => {
        getAtsSettings(scope).then(s => {
            if (!s) return;
            setShift(s.shift);
            setFrequency(s.timesheetFiling?.frequency ?? 'WEEKLY');
        });
    }, [scope]);
    useEffect(() => {
        getOvertime(scope).then(v => v && setOvertime(v));
        getTimesheetNotices(scope).then(v => v && setNotices(v));
    }, [scope, changeKey]);

    const calendarMonths = useCalendarMonths(nav.month, loadMonth, changeKey);

    const toast = useCallback((description: string) => dispatch(showToast({ description, variant: 'success' })), [dispatch]);

    const changed = useCallback(() => {
        setChangeKey(k => k + 1);
        onChanged?.();
    }, [onChanged]);

    /** Run a mutation; on success show the returned week and tell the section. */
    const apply = useCallback(
        async (req: () => Promise<TimesheetWeekView | false>, done?: string) => {
            setBusy(true);
            const res = await req();
            setBusy(false);
            if (!res) return false;
            setWeek(res);
            if (done) toast(done);
            changed();
            return true;
        },
        [setWeek, toast, changed]
    );

    // ---- the period's days -----------------------------------------------------------------------------

    const atsMode = focusWeek?.mode ?? nav.periodWeeks[0]?.mode ?? 'both';
    const { from: rangeFrom, to: rangeTo } = nav.range;
    const periodDays = useMemo(() => {
        if (!nav.periodReady) return null;
        const all = nav.periodWeeks
            .flatMap(w => w.days.map(d => ({ d, join: w.employee.dateOfJoin })))
            .filter(x => x.d.date >= rangeFrom && x.d.date <= rangeTo);
        if (nav.mode === 'day') return all.filter(x => x.d.date === nav.date).map(x => x.d);
        return all.filter(x => isListedDay(x.d, x.join)).map(x => x.d);
    }, [nav.periodReady, nav.periodWeeks, nav.mode, nav.date, rangeFrom, rangeTo]);
    const logged = (periodDays ?? []).reduce((s, d) => s + d.loggedMinutes, 0);
    const expected = (periodDays ?? []).reduce((s, d) => s + d.expectedMinutes, 0);

    // ---- editing --------------------------------------------------------------------------------------

    const weekOfDay = (day: TimesheetDay) => nav.viewFor(day.date);

    const isEditable = (day: TimesheetDay) => {
        const w = weekOfDay(day);
        if (!w || day.locked) return false;
        return w.editMode === 'direct';
    };

    /** Every change saves straight away (PROTOTYPE-SETUP: Final batch, Slice 1 — no Save / draft button). */
    const save = async (_day: TimesheetDay, value: EntryFormValue, id?: string) =>
        id ? apply(() => editEntry(scope, id, value)) : apply(() => addEntry(scope, value));

    const remove = (_day: TimesheetDay, id: string) => {
        apply(() => deleteEntry(scope, id));
    };

    /** PROTOTYPE-SETUP (HR rules, Slice 3): a recorded break's description. */
    const saveBreakDescription = (day: TimesheetDay, index: number, description: string) =>
        apply(() => updateBreakDescription(scope, day.date, index, description), 'Break description saved');

    /** Notices: open another filing period (its first day). */
    const openWeek = (weekStart: string) => nav.pick(weekStart);

    // ---- submission (PROTOTYPE-SETUP: Timesheet filing) ---------------------------------------------------

    const reviewOf = (v: TimesheetWeekView | null | undefined) => (v ? reviewPeriod({ days: v.days, fields: v.filing.fields, mode: v.mode, today }) : null);
    /** The focused period's checks (the card's warnings). */
    const focusReview = useMemo(() => reviewOf(focusWeek), [focusWeek, today]); // eslint-disable-line react-hooks/exhaustive-deps
    /** The period being submitted (the queue's head). */
    const current = queue[0] ?? null;
    const review = useMemo(() => reviewOf(current), [current, today]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Opens the confirmation for the periods in the current view. */
    const openSubmit = () => setViewSubmit(periodsToSubmit(nav.periodWeeks, today));

    /** Sends the queue's periods one by one; a warning pauses it until acknowledged (or the entries are reviewed). */
    const runQueue = async (list: TimesheetWeekView[], ack: SubmissionAcknowledgement) => {
        const [head, ...rest] = list;
        if (!head) {
            setQueue([]);
            const to = focusWeek?.employee.managerName ?? 'Payroll';
            toast(sentKind.current === 'changes' ? `Changes resubmitted to ${to}` : `Sent to ${to} for approval`);
            changed();
            return;
        }
        setQueue(list);
        const kind = submissionPrompt(reviewOf(head)!, 'manual', ack);
        if (kind) {
            setPrompt({ kind, ack });
            return;
        }
        if (submitting.current) return;
        submitting.current = true;
        setPrompt(null);
        setBusy(true);
        const res = await submitWeek(scope, head.week.weekStart, ack);
        setBusy(false);
        submitting.current = false;
        if (!res) {
            setQueue([]);
            return;
        }
        setWeek(res);
        await runQueue(rest, {});
    };

    const confirmSubmit = () => {
        if (!viewSubmit) return;
        sentKind.current = submitKind(viewSubmit) === 'changes' ? 'changes' : 'full';
        const list = viewSubmit;
        setViewSubmit(null);
        runQueue(list, {});
    };

    /** A warning was acknowledged ("… anyway"): carry on with the same period. */
    const advance = (ack: SubmissionAcknowledgement) => {
        if (queue.length) runQueue(queue, ack);
    };

    /** "Review entries": open the day with the entries outlined; the submission waits for another click. */
    const reviewEntries = (date: string, ids: string[]) => {
        setPrompt(null);
        setQueue([]);
        setHighlight(new Set(ids));
        if (nav.mode === 'day') nav.setDate(date);
        else nav.pick(date);
    };

    /** The card's warnings link: the first thing to look at. */
    const reviewFirst = () => {
        if (!focusReview) return;
        const issue = focusReview.issues[0];
        const overlap = focusReview.overlaps[0];
        const gap = focusReview.gaps[0];
        if (issue) reviewEntries(issue.date, focusReview.issues.filter(i => i.date === issue.date).map(i => i.entryId));
        else if (overlap) reviewEntries(overlap.date, focusReview.overlaps.filter(o => o.date === overlap.date).flatMap(o => [o.a, o.b]));
        else if (gap) reviewEntries(gap.date, []);
    };

    const onFix = (day: TimesheetDay) => {
        const flag = day.outsideCheckIn;
        if (!flag) return;
        setCorrection({
            date: day.date,
            initial: flag.suggested,
            current: { checkIn: day.attendance.checkIn, checkOut: day.attendance.checkOut, outDays: day.attendance.outDays, open: day.attendance.open },
        });
    };

    const minimum = overtime?.minimumMinutes ?? DEFAULT_SETTINGS.overtimeMinimumMinutes;
    const overtimeOf = (day: TimesheetDay) => dayOvertime(day, today, minimum);
    const overtimeRequestOn = (date: string) =>
        overtime?.requests.find(r => r.date === date && r.trail.status !== 'REJECTED' && r.trail.status !== 'CANCELLED') ?? null;

    /** Unlogged / calendar: open a day (Day view: that day; Week / Month: open its panel). */
    const openDay = (date: string) => {
        if (nav.mode === 'day') nav.setDate(date);
        else nav.pick(date);
    };

    return (
        <div className="flex w-full min-w-0 flex-col gap-4">
            {/* 1. calendar (65%) + the Notices panel (35%, as tall as the calendar; stacked below 1200px) */}
            <div className="ts-top min-w-0">
                <Calendar3
                    month={nav.month}
                    months={calendarMonths}
                    today={today}
                    selected={nav.mode === 'day' ? nav.date : nav.selected}
                    inRange={inRangeFor(nav.mode, nav.date)}
                    approvalEnabled={focusWeek?.approvalEnabled ?? true}
                    onPick={nav.pick}
                    onShift={nav.shiftMonths}
                    onToday={nav.goToday}
                />
                <NoticesPanel
                    focusWeekStart={nav.focusWeekStart}
                    notices={notices}
                    unlogged={periodDays}
                    today={today}
                    period={nav.mode}
                    history={focusWeek?.approvalEnabled ? focusWeek.week.history : null}
                    onOpenWeek={openWeek}
                    onGoTab={onGoTab}
                    onPickDay={openDay}
                    onGoDay={nav.openDay}
                    week={<WeekStatusCard bare view={focusWeek} today={today} review={focusReview} onStepPeriod={nav.stepPeriod} onReview={reviewFirst} />}
                />
            </div>

            {/* 2. view bar */}
            <ViewBar
                mode={nav.mode}
                label={nav.label}
                logged={logged}
                expected={expected}
                ofWord={atsMode === 'timesheet' ? 'shift' : 'worked'}
                onMode={nav.changeMode}
                onStep={nav.step}
                submit={
                    focusWeek?.approvalEnabled !== false && (
                        <Button size="small" type="primary" onClick={openSubmit} loading={busy && queue.length > 0} data-view-submit-btn>
                            Submit
                        </Button>
                    )
                }
                actions={
                    <>
                        <Button size="small" icon={<DownloadOutlined />} onClick={() => setFileModal('download')}>
                            Download timesheet
                        </Button>
                        <Button size="small" icon={<UploadOutlined />} onClick={() => setFileModal('upload')}>
                            Upload timesheet
                        </Button>
                    </>
                }
            />

            {/* 3. day rows */}
            {periodDays ? (
                <DayRows
                    days={periodDays}
                    mode={atsMode}
                    today={today}
                    shift={shift}
                    view={nav.mode}
                    selected={nav.selected}
                    overtimeOf={overtimeOf}
                    onToggle={nav.toggleDay}
                    panel={day => (
                        <EntriesPanel
                            day={day}
                            mode={atsMode}
                            today={today}
                            editable={isEditable(day)}
                            busy={busy}
                            overtime={overtimeOf(day)}
                            overtimeRequest={overtimeRequestOn(day.date)}
                            onSave={save}
                            onDelete={remove}
                            onRequestOvertime={(d, minutes) => setOvertimeAsk({ date: d.date, minutes })}
                            onFix={onFix}
                            onBreakDescription={saveBreakDescription}
                            fields={weekOfDay(day)?.filing.fields}
                            projectCodes={weekOfDay(day)?.filing.projectCodes}
                            highlight={highlight}
                        />
                    )}
                />
            ) : (
                <div className={ESS_CARD}>
                    <Skeleton active paragraph={{ rows: 6 }} />
                </div>
            )}

            <ViewSubmitModal
                open={Boolean(viewSubmit)}
                mode={nav.mode}
                rangeLabel={nav.label}
                frequency={frequency}
                scope={viewSubmit ?? []}
                managerName={focusWeek?.employee.managerName ?? null}
                busy={busy}
                onConfirm={confirmSubmit}
                onClose={() => setViewSubmit(null)}
            />
            <SubmitReviewModal
                kind={prompt?.kind ?? null}
                review={review}
                entries={current?.week.entries ?? []}
                busy={busy}
                managerName={current?.employee.managerName}
                periodWord={PERIOD_NOUN[current ? periodKind(current.filing.period.start, current.filing.period.end, current.filing.frequency) : 'WEEKLY']}
                onReview={reviewEntries}
                onContinue={() => prompt && advance({ ...prompt.ack, [prompt.kind]: true })}
                onClose={() => {
                    setPrompt(null);
                    setQueue([]);
                }}
            />
            <DownloadModal open={fileModal === 'download'} today={today} onClose={() => setFileModal(null)} />
            <UploadModal
                open={fileModal === 'upload'}
                today={today}
                projectsOn={Boolean(focusWeek?.filing.fields.projectCode)}
                projectCode={focusWeek?.filing.projectCodes[0]}
                fields={focusWeek?.filing.fields}
                onClose={() => setFileModal(null)}
                onImported={() => {
                    setFileModal(null);
                    reload();
                    changed();
                }}
            />
            <CorrectionModal
                open={!!correction}
                date={correction?.date ?? null}
                initial={correction?.initial}
                current={correction?.current}
                fromTimesheet
                shiftEnd={shift.end}
                shiftStart={shift.start}
                onClose={() => setCorrection(null)}
                onSubmitted={() => {
                    setCorrection(null);
                    reload();
                    changed();
                }}
            />
            <OvertimeRequestModal
                open={!!overtimeAsk}
                kind="worked"
                initial={overtimeAsk ? { date: overtimeAsk.date, minutes: overtimeAsk.minutes } : undefined}
                onClose={() => setOvertimeAsk(null)}
                onSubmitted={() => {
                    setOvertimeAsk(null);
                    changed();
                }}
            />
        </div>
    );
};

export default TimesheetTab;
