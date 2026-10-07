// PROTOTYPE-SETUP: ESS Service 1, Slice 4 — the employee's Timesheet tab (modes 'both' and 'timesheet').
// Day / Week / Month on web (Day + Month on mobile, Day with a 7-day strip). Inline add / edit / delete when
// the week is editable directly; an approved week is changed through a change request edited locally and sent
// as the full proposed week. 'both' mode flags time logged outside check-in hours and opens the correction
// modal. Built from the same pieces as TimesheetViewer (TimesheetFrame, DayView, WeekView, MonthView…).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { EditOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, Button, Popconfirm } from 'antd';

import { useAppDispatch } from '@src/hooks/store';
import { diffEntries, diffSummary } from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import {
    addEntry,
    cancelChangeRequest,
    deleteEntry,
    editEntry,
    getTimesheetMonth,
    getTimesheetWeek,
    requestChange,
    submitWeek,
} from '../api';
import CorrectionModal from '../components/CorrectionModal';
import { useAtsScope } from '../hooks/useAtsScope';
import type {
    CorrectionKind,
    TimesheetDay,
    TimesheetEntry,
    TimesheetEntryInput,
    TimesheetWeekView,
} from '../types';
import ChangeRequestPanel from './ChangeRequestPanel';
import type { DayEditHandlers } from './DayView';
import type { EntryMark } from './EntryRow';
import { weekdayLabel, withEntries } from './helpers';
import SendChangeModal from './SendChangeModal';
import TimesheetFrame from './TimesheetFrame';
import { useTimesheetNav } from './useTimesheetNav';

export interface TimesheetTabProps {
    /** Called after anything changes (entries, submit, change request, correction) so the section can refresh counts. */
    onChanged?: () => void;
}

interface CorrectionTarget {
    date: string;
    kind: CorrectionKind;
    initial: { checkIn: string | null; checkOut: string | null };
    current: { checkIn: string | null; checkOut: string | null; checkOutAuto: boolean };
}

const DRAFT_PREFIX = 'draft-';

const TimesheetTab = ({ onChanged }: TimesheetTabProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const loadWeek = useCallback((d: string) => getTimesheetWeek(scope, d), [scope]);
    const loadMonth = useCallback((m: string) => getTimesheetMonth(scope, m), [scope]);
    const nav = useTimesheetNav({ loadWeek, loadMonth });
    const { view, today, setWeek, reload } = nav;

    const [busy, setBusy] = useState(false);
    /** Change-request draft: the full proposed week, edited locally. */
    const [draft, setDraft] = useState<TimesheetEntry[] | null>(null);
    const [sendOpen, setSendOpen] = useState(false);
    const [correction, setCorrection] = useState<CorrectionTarget | null>(null);
    const seq = useRef(0);

    useEffect(() => {
        setDraft(null);
        setSendOpen(false);
    }, [nav.weekStart]);

    const toast = useCallback(
        (description: string) => dispatch(showToast({ description, variant: 'success' })),
        [dispatch]
    );

    /** Run a mutation; on success show the returned week and tell the section. */
    const apply = useCallback(
        async (req: () => Promise<TimesheetWeekView | false>, done?: string) => {
            setBusy(true);
            const res = await req();
            setBusy(false);
            if (!res) return false;
            setWeek(res);
            if (done) toast(done);
            onChanged?.();
            return true;
        },
        [setWeek, toast, onChanged]
    );

    const pending = view?.changeRequest?.status === 'PENDING' ? view.changeRequest : null;
    const base = useMemo(() => (view ? (view.week.approvedEntries ?? view.week.entries) : []), [view]);

    const draftDays = useMemo<TimesheetDay[] | undefined>(
        () => (view && draft ? view.days.map(d => withEntries(d, draft, today)) : undefined),
        [view, draft, today]
    );

    const marks = useMemo(() => {
        if (!draft) return undefined;
        const diff = diffEntries(base, draft);
        return new Map<string, EntryMark>([
            ...diff.added.map(e => [e.id, 'added'] as [string, EntryMark]),
            ...diff.edited.map(x => [x.after.id, 'edited'] as [string, EntryMark]),
        ]);
    }, [draft, base]);

    const directEdit: DayEditHandlers = {
        busy,
        onAdd: input => apply(() => addEntry(scope, input)),
        onEdit: (id, input) => apply(() => editEntry(scope, id, input)),
        onDelete: id => apply(() => deleteEntry(scope, id)),
    };

    const draftEdit: DayEditHandlers = {
        onAdd: (input: TimesheetEntryInput) => {
            seq.current += 1;
            const id = `${DRAFT_PREFIX}${seq.current}`;
            setDraft(d => [...(d ?? []), { id, ...input }]);
            return true;
        },
        onEdit: (id, input) => {
            setDraft(d => (d ?? []).map(e => (e.id === id ? { id, ...input } : e)));
            return true;
        },
        onDelete: id => {
            setDraft(d => (d ?? []).filter(e => e.id !== id));
            return true;
        },
    };

    let edit: DayEditHandlers | undefined;
    if (draft) edit = draftEdit;
    else if (view?.editMode === 'direct') edit = directEdit;

    const startDraft = () => {
        if (!view) return;
        setDraft((pending?.proposedEntries ?? view.week.entries).map(e => ({ ...e })));
    };

    const sendChange = async (reason: string) => {
        if (!view || !draft) return false;
        const entries = draft.map(({ id, ...rest }) => (id.startsWith(DRAFT_PREFIX) ? rest : { id, ...rest }));
        const ok = await apply(
            () => requestChange(scope, view.week.weekStart, { reason, entries }),
            view.employee.managerName
                ? `Change request sent to ${view.employee.managerName}`
                : 'Change request sent'
        );
        if (ok) {
            setDraft(null);
            setSendOpen(false);
        }
        return ok;
    };

    const onFlagAction = (day: TimesheetDay) => {
        const flag = day.outsideCheckIn;
        if (!flag) return;
        setCorrection({
            date: day.date,
            kind: flag.action === 'update-check-out' ? 'update-check-out' : 'correction',
            initial: flag.suggested,
            current: {
                checkIn: day.attendance.checkIn,
                checkOut: day.attendance.checkOut,
                checkOutAuto: day.attendance.checkOutAuto,
            },
        });
    };

    // ---- week bar: actions + approval copy ------------------------------------------------------------

    let weekActions = null;
    let weekNote: string | undefined;
    if (view && !draft && view.canSubmit) {
        const resubmit = view.week.status === 'SENT_BACK';
        const to = view.employee.managerName ?? 'your manager';
        weekActions = (
            <Popconfirm
                title={resubmit ? 'Resubmit this week?' : 'Submit this week?'}
                description={`It goes to ${to} for approval. You can still edit it afterwards.`}
                okText={resubmit ? 'Resubmit' : 'Submit'}
                onConfirm={() =>
                    apply(() => submitWeek(scope, view.week.weekStart), `Week sent to ${to} for approval`)
                }
            >
                <Button type="primary" icon={<SendOutlined />} loading={busy}>
                    {resubmit ? 'Resubmit week' : 'Submit week'}
                </Button>
            </Popconfirm>
        );
    }
    if (view?.approvalEnabled && view.week.status === 'DRAFT') {
        const day = weekdayLabel(view.submissionWeekday);
        weekNote = view.canSubmit
            ? `Not submitted yet. If you don't submit it, the week is sent to your manager automatically every ${day}.`
            : `You can plan ahead. Weeks are sent to your manager automatically every ${day} once they've started.`;
    }

    // ---- notices: change requests ---------------------------------------------------------------------

    let notices = null;
    if (view && draft) {
        const summary = diffSummary(diffEntries(base, draft));
        const nothing = summary === 'no changes';
        notices = (
            <Alert
                type="info"
                showIcon
                icon={<EditOutlined />}
                message={<span className="font-medium">Editing a change request</span>}
                description={
                    <div className="flex flex-col gap-2">
                        <span className="text-sm">
                            Add, edit or delete entries below. Nothing changes until you send the request
                            {nothing ? '.' : ` — so far: ${summary}.`}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            <Button type="primary" size="small" disabled={nothing} onClick={() => setSendOpen(true)}>
                                Review and send
                            </Button>
                            <Button size="small" onClick={() => setDraft(null)}>
                                Discard changes
                            </Button>
                        </div>
                    </div>
                }
            />
        );
    } else if (view) {
        notices = (
            <>
                {view.editMode === 'change-request' && (
                    <Alert
                        type="success"
                        showIcon
                        message={<span className="font-medium">This week is approved. To change it, request a change.</span>}
                        description={
                            <div className="flex flex-col gap-2">
                                <span className="text-sm text-gray-600">
                                    {pending
                                        ? 'You already have a change pending. Updating it replaces the pending request.'
                                        : 'Edit the week, add a reason, and your manager reviews the change.'}
                                </span>
                                <Button size="small" className="self-start" icon={<EditOutlined />} onClick={startDraft}>
                                    {pending ? 'Update the request' : 'Request a change'}
                                </Button>
                            </div>
                        }
                    />
                )}
                {view.changeRequest && (
                    <ChangeRequestPanel
                        cr={view.changeRequest}
                        perspective="employee"
                        busy={busy}
                        onCancel={
                            pending
                                ? () =>
                                      apply(
                                          () => cancelChangeRequest(scope, view.week.weekStart),
                                          'Change request cancelled'
                                      )
                                : undefined
                        }
                    />
                )}
            </>
        );
    }

    return (
        <>
            <TimesheetFrame
                nav={nav}
                perspective="employee"
                days={draftDays}
                edit={edit}
                marks={marks}
                onFlagAction={!draft && view?.mode === 'both' ? onFlagAction : undefined}
                weekActions={weekActions}
                weekNote={weekNote}
                notices={notices}
            />
            {view && draft && (
                <SendChangeModal
                    open={sendOpen}
                    base={base}
                    proposed={draft}
                    replacing={!!pending}
                    managerName={view.employee.managerName}
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
                onClose={() => setCorrection(null)}
                onSubmitted={() => {
                    setCorrection(null);
                    reload();
                    onChanged?.();
                }}
            />
        </>
    );
};

export default TimesheetTab;
