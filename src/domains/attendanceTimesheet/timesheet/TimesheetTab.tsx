// PROTOTYPE-SETUP: ESS Service 1 — the employee's Timesheet tab (modes 'both' and 'timesheet'), V2 layout from
// docs/prototypes/attendance-timesheet.html:
//   1. top area  — three-month calendar (left); week status, unlogged hours and history cards (right)
//   2. view bar  — Day / Week / Month, period arrows and label, "Logged X of Y expected" (Week view by default)
//   3. day rows  — a shared 7am–10pm axis; per day the date, a meta line, the bar, the meter and the entries panel
//                  (always open in Day view; one at a time in Week / Month).
// Entries can be timed or hours-only. An approved week is changed through a change request edited locally and
// sent as the full proposed week. 'both' mode flags time logged outside check-in hours and offers a correction;
// past days with extra time offer overtime.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Skeleton } from 'antd';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { useAppDispatch } from '@src/hooks/store';
import { DEFAULT_SETTINGS, diffEntries, weekStartOf } from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import {
    addEntry,
    cancelChangeRequest,
    deleteEntry,
    editEntry,
    getAtsSettings,
    getOvertime,
    getTimesheetMonth,
    getTimesheetWeek,
    requestChange,
    submitWeek,
} from '../api';
import { dayOvertime } from './dayModel';
import CorrectionModal from '../components/CorrectionModal';
import OvertimeRequestModal from '../components/OvertimeRequestModal';
import { useAtsScope } from '../hooks/useAtsScope';
import type { CorrectionKind, OvertimeView, TimesheetDay, TimesheetEntry, TimesheetWeekView } from '../types';
import Calendar3, { inRangeFor } from './Calendar3';
import DayRows from './DayRows';
import EntriesPanel from './EntriesPanel';
import type { EntryFormValue } from './EntryForm';
import { withEntries } from './helpers';
import SendChangeModal from './SendChangeModal';
import UnloggedHoursCard from './UnloggedHoursCard';
import { useCalendarMonths } from './useCalendarMonths';
import { isListedDay, useTimesheetNav } from './useTimesheetNav';
import ViewBar from './ViewBar';
import WeekHistory from './WeekHistory';
import WeekStatusCard from './WeekStatusCard';

export interface TimesheetTabProps {
    /** Called after anything changes (entries, submit, change request, correction) so the section can refresh counts. */
    onChanged?: () => void;
    /** PROTOTYPE-SETUP (Overview, Slice 2): open on this day (Week view, the day's panel open). */
    initialDate?: string;
}

interface CorrectionTarget {
    date: string;
    kind: CorrectionKind;
    initial: { checkIn: string | null; checkOut: string | null };
    current: { checkIn: string | null; checkOut: string | null; checkOutAuto: boolean };
}

/** Change-request draft: the full proposed week, edited locally. */
interface Draft {
    weekStart: string;
    entries: TimesheetEntry[];
}

const DRAFT_PREFIX = 'draft-';

const TimesheetTab = ({ onChanged, initialDate }: TimesheetTabProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const loadWeek = useCallback((d: string) => getTimesheetWeek(scope, d), [scope]);
    const loadMonth = useCallback((m: string) => getTimesheetMonth(scope, m), [scope]);
    const nav = useTimesheetNav({ loadWeek, initialDate });
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
    const [shift, setShift] = useState(DEFAULT_SETTINGS.shift);
    const seq = useRef(0);

    useEffect(() => setShowProposed(false), [nav.focusWeekStart]);
    useEffect(() => {
        getAtsSettings(scope).then(s => s && setShift(s.shift));
    }, [scope]);
    useEffect(() => {
        getOvertime(scope).then(v => v && setOvertime(v));
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
    const periodDays = useMemo(() => {
        if (!nav.periodReady) return null;
        const all = nav.periodWeeks.flatMap(w => daysOf(w).map(d => ({ d, join: w.employee.dateOfJoin })));
        if (nav.mode === 'day') return all.filter(x => x.d.date === nav.date).map(x => x.d);
        if (nav.mode === 'week') return all.filter(x => isListedDay(x.d, x.join)).map(x => x.d);
        return all.filter(x => x.d.date.slice(0, 7) === nav.month && isListedDay(x.d, x.join)).map(x => x.d);
    }, [nav.periodReady, nav.periodWeeks, nav.mode, nav.date, nav.month, daysOf]);
    const logged = (periodDays ?? []).reduce((s, d) => s + d.loggedMinutes, 0);
    const expected = (periodDays ?? []).reduce((s, d) => s + d.expectedMinutes, 0);

    // ---- editing --------------------------------------------------------------------------------------

    const weekOfDay = (day: TimesheetDay) => nav.weeks[weekStartOf(day.date)];

    const isEditable = (day: TimesheetDay) => {
        const w = weekOfDay(day);
        if (!w || day.locked) return false;
        if (draft && draft.weekStart === w.week.weekStart) return true;
        if (showProposed && w.week.weekStart === nav.focusWeekStart && pending) return false;
        return w.editMode === 'direct';
    };

    const save = async (day: TimesheetDay, value: EntryFormValue, id?: string) => {
        const ws = weekStartOf(day.date);
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
        const ws = weekStartOf(day.date);
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

    const onFix = (day: TimesheetDay) => {
        const flag = day.outsideCheckIn;
        if (!flag) return;
        setCorrection({
            date: day.date,
            kind: flag.action === 'update-check-out' ? 'update-check-out' : 'correction',
            initial: flag.suggested,
            current: { checkIn: day.attendance.checkIn, checkOut: day.attendance.checkOut, checkOutAuto: day.attendance.checkOutAuto },
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
            {/* 1. calendar + cards */}
            <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
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
                <div className="flex min-w-0 flex-col gap-3">
                    <WeekStatusCard
                        view={focusWeek}
                        today={today}
                        busy={busy}
                        editingChanges={changeCount}
                        showProposed={showProposed}
                        onResubmit={() =>
                            focusWeek &&
                            apply(() => submitWeek(scope, focusWeek.week.weekStart), `Resubmitted to ${focusWeek.employee.managerName ?? 'your manager'}`)
                        }
                        onRequestChange={startDraft}
                        onToggleProposed={() => setShowProposed(v => !v)}
                        onWithdraw={() =>
                            focusWeek &&
                            apply(() => cancelChangeRequest(scope, focusWeek.week.weekStart), 'Change request withdrawn').then(() => setShowProposed(false))
                        }
                        onSendChange={() => setSendOpen(true)}
                        onDiscard={() => setDraft(null)}
                    />
                    <UnloggedHoursCard days={periodDays} today={today} period={nav.mode} onPick={openDay} />
                    {focusWeek?.approvalEnabled && focusWeek.week.history.length > 0 && <WeekHistory history={focusWeek.week.history} />}
                </div>
            </div>

            {/* 2. view bar */}
            <ViewBar
                mode={nav.mode}
                label={nav.label}
                logged={logged}
                expected={expected}
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
            <CorrectionModal
                open={!!correction}
                date={correction?.date ?? null}
                kind={correction?.kind ?? 'correction'}
                initial={correction?.initial}
                current={correction?.current}
                fromTimesheet
                shiftEnd={shift.end}
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
