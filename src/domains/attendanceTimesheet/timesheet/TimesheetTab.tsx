// PROTOTYPE-SETUP: ESS Service 1 — the employee's Timesheet tab (modes 'both' and 'timesheet'), V2 layout from
// docs/prototypes/attendance-timesheet.html:
//   1. top area  — three-month calendar (65%); the Notices panel (35%, same height, scrolls inside): the focused week,
//                  "Needs your action" across all weeks, unlogged hours, history (HR rules, Slice 3)
//   2. view bar  — Day / Week / Month, period arrows and label, "Logged X of Y worked" (Week view by default)
//   3. day rows  — a shared hour axis (past midnight when needed); per day the date, a meta line, the bar, the meter
//                  and the entries panel with the day's breaks (always open in Day view; one at a time in Week / Month).
// Entries can be timed or hours-only. An approved week is changed through a change request edited locally and
// sent as the full proposed week. 'both' mode flags time logged outside check-in hours and offers a correction;
// past days with extra time offer overtime.
// PROTOTYPE-SETUP (Timesheet filing): the status card is the company's filing period (day / week / month) with ‹ ›,
// a summary and its warnings. Submit (or Resubmit) runs the period's checks first (submissionPrompt): entries missing
// a required field stop it ("Review entries"); overlaps, then gaps over 5 minutes, warn ("Review entries" /
// "Continue anyway" / "Submit anyway"). The toast only shows once the server has accepted it; a second click can't
// submit twice. Automatic submission happens on the server and never shows these warnings.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Skeleton } from 'antd';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { useAppDispatch } from '@src/hooks/store';
import { DEFAULT_SETTINGS, diffEntries } from '@src/prototype/rules/attendance';
import { SubmissionAcknowledgement, SubmissionPrompt, reviewPeriod, submissionPrompt } from '@src/prototype/rules/timesheetFiling';
import { showToast } from '@src/slices/apiSlice';

import {
    addEntry,
    cancelChangeRequest,
    deleteEntry,
    editEntry,
    getAtsSettings,
    getOvertime,
    getTimesheetMonth,
    getTimesheetNotices,
    getTimesheetPeriods,
    requestChange,
    submitWeek,
    updateBreakDescription,
} from '../api';
import { dayOvertime } from './dayModel';
import CorrectionModal from '../components/CorrectionModal';
import OvertimeRequestModal from '../components/OvertimeRequestModal';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsTab, CorrectionTimes, FilingFrequency, OvertimeView, TimesheetDay, TimesheetEntry, TimesheetNotices, TimesheetWeekView } from '../types';
import Calendar3, { inRangeFor } from './Calendar3';
import DayRows from './DayRows';
import EntriesPanel from './EntriesPanel';
import type { EntryFormValue } from './EntryForm';
import { withEntries } from './helpers';
import NoticesPanel from './NoticesPanel';
import SendChangeModal from './SendChangeModal';
import SubmitReviewModal from './SubmitReviewModal';
import './timesheet.css';
import { useCalendarMonths } from './useCalendarMonths';
import { isListedDay, useTimesheetNav } from './useTimesheetNav';
import ViewBar from './ViewBar';
import WeekStatusCard from './WeekStatusCard';

export interface TimesheetTabProps {
    /** Called after anything changes (entries, submit, change request, correction) so the section can refresh counts. */
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

/** Change-request draft: the full proposed week, edited locally. */
interface Draft {
    weekStart: string;
    entries: TimesheetEntry[];
}

const DRAFT_PREFIX = 'draft-';

const TimesheetTab = ({ onChanged, initialDate, onGoTab }: TimesheetTabProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const loadRange = useCallback((from: string, to: string) => getTimesheetPeriods(scope, from, to), [scope]);
    const loadMonth = useCallback((m: string) => getTimesheetMonth(scope, m), [scope]);
    const [frequency, setFrequency] = useState<FilingFrequency | undefined>();
    const nav = useTimesheetNav({ loadRange, initialDate, frequency });
    const { today, focusWeek, setWeek, reload } = nav;

    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [sendOpen, setSendOpen] = useState(false);
    /** Pending change request (focus week): show the proposed entries instead of the approved ones. */
    const [showProposed, setShowProposed] = useState(false);
    const [correction, setCorrection] = useState<CorrectionTarget | null>(null);
    const [overtimeAsk, setOvertimeAsk] = useState<{ date: string; minutes: number } | null>(null);
    /** Bumped after every change so the calendar colours and overtime refresh. */
    const [changeKey, setChangeKey] = useState(0);
    const [overtime, setOvertime] = useState<OvertimeView | null>(null);
    const [notices, setNotices] = useState<TimesheetNotices | null>(null);
    const [shift, setShift] = useState(DEFAULT_SETTINGS.shift);
    const seq = useRef(0);
    /** PROTOTYPE-SETUP (Timesheet filing): the submission warning showing, and what was acknowledged so far. */
    const [prompt, setPrompt] = useState<{ kind: Exclude<SubmissionPrompt, null>; ack: SubmissionAcknowledgement } | null>(null);
    /** "Review entries": the entries outlined in their day's panel. */
    const [highlight, setHighlight] = useState<Set<string>>(new Set());
    const submitting = useRef(false);

    useEffect(() => setShowProposed(false), [nav.focusWeekStart]);
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

    const pending = focusWeek?.changeRequest?.status === 'PENDING' ? focusWeek.changeRequest : null;
    const focusBase = useMemo(() => (focusWeek ? (focusWeek.week.approvedEntries ?? focusWeek.week.entries) : []), [focusWeek]);
    const draftHere = draft && draft.weekStart === nav.focusWeekStart ? draft : null;
    const diff = useMemo(() => (draftHere ? diffEntries(focusBase, draftHere.entries) : null), [draftHere, focusBase]);
    const changeCount = diff ? diff.added.length + diff.edited.length + diff.removed.length : null;

    /** A week's days as shown: the draft or the proposed change applied when relevant. */
    const daysOf = useCallback(
        (w: TimesheetWeekView): TimesheetDay[] => {
            const ws = w.week.weekStart;
            if (draft && draft.weekStart === ws) return w.days.map(d => withEntries(d, draft.entries, today));
            const cr = w.changeRequest?.status === 'PENDING' ? w.changeRequest : null;
            if (showProposed && cr && ws === nav.focusWeekStart) return w.days.map(d => withEntries(d, cr.proposedEntries, today));
            return w.days;
        },
        [draft, showProposed, nav.focusWeekStart, today]
    );

    // ---- the period's days -----------------------------------------------------------------------------

    const atsMode = focusWeek?.mode ?? nav.periodWeeks[0]?.mode ?? 'both';
    const { from: rangeFrom, to: rangeTo } = nav.range;
    const periodDays = useMemo(() => {
        if (!nav.periodReady) return null;
        const all = nav.periodWeeks
            .flatMap(w => daysOf(w).map(d => ({ d, join: w.employee.dateOfJoin })))
            .filter(x => x.d.date >= rangeFrom && x.d.date <= rangeTo);
        if (nav.mode === 'day') return all.filter(x => x.d.date === nav.date).map(x => x.d);
        return all.filter(x => isListedDay(x.d, x.join)).map(x => x.d);
    }, [nav.periodReady, nav.periodWeeks, nav.mode, nav.date, rangeFrom, rangeTo, daysOf]);
    const logged = (periodDays ?? []).reduce((s, d) => s + d.loggedMinutes, 0);
    const expected = (periodDays ?? []).reduce((s, d) => s + d.expectedMinutes, 0);

    // ---- editing --------------------------------------------------------------------------------------

    const weekOfDay = (day: TimesheetDay) => nav.viewFor(day.date);

    const isEditable = (day: TimesheetDay) => {
        const w = weekOfDay(day);
        if (!w || day.locked) return false;
        if (draft && draft.weekStart === w.week.weekStart) return true;
        if (showProposed && w.week.weekStart === nav.focusWeekStart && pending) return false;
        return w.editMode === 'direct';
    };

    const save = async (day: TimesheetDay, value: EntryFormValue, id?: string) => {
        const ws = weekOfDay(day)?.week.weekStart;
        if (draft && draft.weekStart === ws) {
            if (id) setDraft(d => d && { ...d, entries: d.entries.map(e => (e.id === id ? { id, ...value } : e)) });
            else {
                seq.current += 1;
                const newId = `${DRAFT_PREFIX}${seq.current}`;
                setDraft(d => d && { ...d, entries: [...d.entries, { id: newId, ...value }] });
            }
            return true;
        }
        return id ? apply(() => editEntry(scope, id, value)) : apply(() => addEntry(scope, value));
    };

    const remove = (day: TimesheetDay, id: string) => {
        const ws = weekOfDay(day)?.week.weekStart;
        if (draft && draft.weekStart === ws) {
            setDraft(d => d && { ...d, entries: d.entries.filter(e => e.id !== id) });
            return;
        }
        apply(() => deleteEntry(scope, id));
    };

    const startDraft = () => {
        if (!focusWeek) return;
        setShowProposed(false);
        setDraft({
            weekStart: focusWeek.week.weekStart,
            entries: (pending?.proposedEntries ?? focusWeek.week.entries).map(e => ({ ...e })),
        });
    };

    const sendChange = async (reason: string) => {
        if (!focusWeek || !draftHere) return false;
        const entries = draftHere.entries.map(({ id, ...rest }) => (id.startsWith(DRAFT_PREFIX) ? rest : { id, ...rest }));
        const to = focusWeek.employee.managerName;
        const ok = await apply(() => requestChange(scope, focusWeek.week.weekStart, { reason, entries }), to ? `Change sent to ${to}` : 'Change sent');
        if (ok) {
            setDraft(null);
            setSendOpen(false);
        }
        return ok;
    };

    /** PROTOTYPE-SETUP (HR rules, Slice 3): a recorded break's description. */
    const saveBreakDescription = (day: TimesheetDay, index: number, description: string) =>
        apply(() => updateBreakDescription(scope, day.date, index, description), 'Break description saved');

    /** Notices: open another filing period (its first day). */
    const openWeek = (weekStart: string) => {
        setDraft(null);
        nav.pick(weekStart);
    };

    // ---- submission (PROTOTYPE-SETUP: Timesheet filing) ---------------------------------------------------

    const review = useMemo(
        () => (focusWeek ? reviewPeriod({ days: focusWeek.days, fields: focusWeek.filing.fields, mode: focusWeek.mode, today }) : null),
        [focusWeek, today]
    );

    const send = async (ack: SubmissionAcknowledgement) => {
        if (!focusWeek || submitting.current) return;
        submitting.current = true;
        setPrompt(null);
        const manager = focusWeek.employee.managerName ?? 'your manager';
        const again = focusWeek.week.status === 'SENT_BACK';
        await apply(() => submitWeek(scope, focusWeek.week.weekStart, ack), again ? `Resubmitted to ${manager}` : `Submitted to ${manager}`);
        submitting.current = false;
    };

    /** Submit / Resubmit, or the next warning still to acknowledge. */
    const advance = (ack: SubmissionAcknowledgement) => {
        if (!review) return;
        const kind = submissionPrompt(review, 'manual', ack);
        if (kind) setPrompt({ kind, ack });
        else send(ack);
    };

    /** "Review entries": open the day with the entries outlined; the submission waits for another click. */
    const reviewEntries = (date: string, ids: string[]) => {
        setPrompt(null);
        setDraft(null);
        setHighlight(new Set(ids));
        if (nav.mode === 'day') nav.setDate(date);
        else nav.pick(date);
    };

    /** The card's warnings link: the first thing to look at. */
    const reviewFirst = () => {
        if (!review) return;
        const issue = review.issues[0];
        const overlap = review.overlaps[0];
        const gap = review.gaps[0];
        if (issue) reviewEntries(issue.date, review.issues.filter(i => i.date === issue.date).map(i => i.entryId));
        else if (overlap) reviewEntries(overlap.date, review.overlaps.filter(o => o.date === overlap.date).flatMap(o => [o.a, o.b]));
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
                    week={
                    <WeekStatusCard
                        bare
                        view={focusWeek}
                        today={today}
                        busy={busy}
                        editingChanges={changeCount}
                        showProposed={showProposed}
                        review={draft ? null : review}
                        onSubmit={() => advance({})}
                        onStepPeriod={nav.stepPeriod}
                        onReview={reviewFirst}
                        onRequestChange={startDraft}
                        onToggleProposed={() => setShowProposed(v => !v)}
                        onWithdraw={() =>
                            focusWeek &&
                            apply(() => cancelChangeRequest(scope, focusWeek.week.weekStart), 'Change request withdrawn').then(() => setShowProposed(false))
                        }
                        onSendChange={() => setSendOpen(true)}
                        onDiscard={() => setDraft(null)}
                    />
                    }
                />
            </div>

            {/* 2. view bar */}
            <ViewBar
                mode={nav.mode}
                label={nav.label}
                logged={logged}
                expected={expected}
                ofWord={atsMode === 'timesheet' ? 'shift' : 'worked'}
                editingChange={Boolean(draft)}
                showingProposed={showProposed && Boolean(pending)}
                onMode={nav.changeMode}
                onStep={nav.step}
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
                            actionsDisabled={Boolean(draft) || showProposed}
                            onSave={save}
                            onDelete={remove}
                            onRequestOvertime={(d, minutes) => setOvertimeAsk({ date: d.date, minutes })}
                            onFix={onFix}
                            onBreakDescription={draft ? undefined : saveBreakDescription}
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

            {focusWeek && draftHere && (
                <SendChangeModal
                    open={sendOpen}
                    base={focusBase}
                    proposed={draftHere.entries}
                    replacing={!!pending}
                    managerName={focusWeek.employee.managerName}
                    busy={busy}
                    onSend={sendChange}
                    onClose={() => setSendOpen(false)}
                />
            )}
            <SubmitReviewModal
                kind={prompt?.kind ?? null}
                review={review}
                entries={focusWeek?.week.entries ?? []}
                busy={busy}
                onReview={reviewEntries}
                onContinue={() => prompt && advance({ ...prompt.ack, [prompt.kind]: true })}
                onClose={() => setPrompt(null)}
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
