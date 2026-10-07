// PROTOTYPE-SETUP: Timesheet V1, Slice 2 — My Timesheet (ESS). Runs as the current ESS persona, so the same
// page serves ESS - Employee and ESS - Manager (the manager's own timesheet).
//   Draft / Rejected / Submitted weeks: edits save directly (a submitted week stays with the manager).
//   Approved weeks: the first edit asks for a reason and starts a Change Request draft; edits are staged
//   locally and sent together ("Submit for approval"). Locked (payroll-processed) days are view-only.
import { useEffect, useRef, useState } from 'react';

import { Alert, Button, Col, Flex, List, Result, Row, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';

import { useMyTimesheet } from '@src/domains/timesheet/hooks/useMyTimesheet';
import type { TimesheetEntry, TimesheetEntryInput } from '@src/domains/timesheet/types';
import {
    diffEntries,
    diffSummary,
    displayTime,
    minutesOutsideWindow,
    weekStartOf,
} from '@src/domains/timesheet/utils';
import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { requestOvertimeApi } from '../api/overtime';
import RequestOvertimeModal from '../components/RequestOvertimeModal';
import ChangeHistory from '../components/timesheet/ChangeHistory';
import ChangeReasonModal from '../components/timesheet/ChangeReasonModal';
import ChangeRequestBar from '../components/timesheet/ChangeRequestBar';
import DayRow from '../components/timesheet/DayRow';
import HoursSummaryCard from '../components/timesheet/HoursSummaryCard';
import WeekToolbar from '../components/timesheet/WeekToolbar';
import { useEssIdentity } from '../hooks/useEssIdentity';

const { Text } = Typography;

const today = () => dayjs().format('YYYY-MM-DD');
const sortEntries = (list: TimesheetEntry[]) =>
    [...list].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));

type Draft = { reason: string; entries: TimesheetEntry[] };

const MyTimesheet = () => {
    const dispatch = useAppDispatch();
    const { role, id } = useEssIdentity();
    const [params, setParams] = useSearchParams();
    const weekStart = weekStartOf(params.get('week') ?? today());
    const ts = useMyTimesheet(weekStart);
    const { view } = ts;

    const [draft, setDraft] = useState<Draft | null>(null);
    const [reasonOpen, setReasonOpen] = useState(false);
    const reasonResolver = useRef<((reason: string | null) => void) | null>(null);
    const [overtime, setOvertime] = useState<{ date: string; flagged: TimesheetEntry[] } | null>(
        null
    );

    useEffect(() => setDraft(null), [weekStart]);

    if (ts.loading && !view) return <Skeleton active paragraph={{ rows: 10 }} />;
    if (!view)
        return (
            <Result
                status="warning"
                title="Couldn't load your timesheet"
                extra={<Button onClick={ts.reload}>Retry</Button>}
            />
        );
    if (view.mode === 'attendance') {
        return (
            <Result
                status="info"
                title="Timesheets are turned off for your company"
                subTitle="Your company tracks attendance only (punch in / out). Contact HR if you expected to log time."
            />
        );
    }

    const { week, windows } = view;
    const approved = week.status === 'APPROVED';
    const pendingCr = view.changeRequest?.status === 'PENDING' ? view.changeRequest : null;
    const base = week.approvedEntries ?? week.entries;
    const shown = draft?.entries ?? week.entries;
    const diff = approved && (draft || pendingCr) ? diffEntries(base, shown) : null;
    const marks = diff
        ? new Map<string, 'added' | 'edited'>([
              ...diff.added.map(e => [e.id, 'added'] as [string, 'added']),
              ...diff.edited.map(e => [e.after.id, 'edited'] as [string, 'edited']),
          ])
        : undefined;
    const lockedDays = windows.filter(w => w.locked);

    const goToWeek = (next: string) => {
        params.set('week', next);
        setParams(params, { replace: true });
    };

    /** Approved week: make sure a Change Request draft exists (asks for the reason the first time). */
    const ensureDraft = async (): Promise<boolean> => {
        if (draft) return true;
        setReasonOpen(true);
        const reason = await new Promise<string | null>(resolve => {
            reasonResolver.current = resolve;
        });
        if (!reason) return false;
        setDraft({ reason, entries: week.entries });
        return true;
    };

    const applyToDraft = (fn: (entries: TimesheetEntry[]) => TimesheetEntry[]) =>
        setDraft(d => (d ? { ...d, entries: sortEntries(fn(d.entries)) } : d));

    const onAdd = async (input: TimesheetEntryInput) => {
        if (!approved) return ts.addEntry(input);
        if (!(await ensureDraft())) return false;
        applyToDraft(list => [...list, { id: `draft-${Date.now()}`, ...input }]);
        return true;
    };
    const onUpdate = async (entryId: string, input: TimesheetEntryInput) => {
        if (!approved) return ts.updateEntry(entryId, input);
        if (!(await ensureDraft())) return false;
        applyToDraft(list => list.map(e => (e.id === entryId ? { ...e, ...input } : e)));
        return true;
    };
    const onDelete = async (entryId: string) => {
        if (!approved) return ts.deleteEntry(entryId);
        if (!(await ensureDraft())) return false;
        applyToDraft(list => list.filter(e => e.id !== entryId));
        return true;
    };

    const submitDraft = async () => {
        if (!draft) return;
        const ok = await ts.submitChangeRequest({
            reason: draft.reason,
            entries: draft.entries.map(({ id: entryId, ...rest }) => ({
                ...rest,
                ...(entryId.startsWith('draft-') ? {} : { id: entryId }),
            })),
        });
        if (ok) {
            setDraft(null);
            dispatch(
                showToast({
                    variant: 'success',
                    description: 'Change request sent to your manager.',
                })
            );
        }
    };

    const submitWeek = async () => {
        const ok = await ts.submitWeek();
        if (ok)
            dispatch(
                showToast({
                    variant: 'success',
                    description: 'Timesheet submitted to your manager.',
                })
            );
    };

    const overtimeHours = (o: { date: string; flagged: TimesheetEntry[] }) => {
        const w = windows.find(x => x.date === o.date)!;
        const minutes = o.flagged.reduce((s, e) => s + minutesOutsideWindow(e, w), 0);
        return String(Math.round((minutes / 60) * 4) / 4);
    };

    const requestOvertime = async (body: { date: string; hours: number; notes?: string }) => {
        try {
            await requestOvertimeApi(
                { userType: role, userId: id },
                { ...body, timesheetEntryIds: overtime?.flagged.map(e => e.id) }
            );
            dispatch(
                showToast({
                    variant: 'success',
                    description: 'Overtime request sent to your manager.',
                })
            );
            return true;
        } catch {
            return false;
        }
    };

    return (
        <Flex vertical gap={16} className="w-full min-w-0">
            <WeekToolbar
                weekStart={weekStart}
                status={week.status}
                changePending={!!pendingCr}
                lockedReason={lockedDays.length === 7 ? lockedDays[0].lockReason : undefined}
                autoSubmitted={week.autoSubmitted}
                autoSubmit={view.autoSubmit}
                submissionWeekday={view.submissionWeekday}
                busy={ts.busy}
                onWeekChange={goToWeek}
                onAutoSubmitChange={ts.setAutoSubmit}
                onSubmit={submitWeek}
            />

            {week.status === 'REJECTED' && week.decision && (
                <Alert
                    type="error"
                    showIcon
                    message={`Rejected by ${week.decision.by.name} on ${dayjs(week.decision.at).format('D MMM')}`}
                    description={
                        <>
                            {week.decision.comment && <Text>“{week.decision.comment}”</Text>}
                            <br />
                            <Text type="secondary" className="text-xs">
                                {lockedDays.length === 7
                                    ? 'Payroll for this period has been processed, so the week can no longer be changed.'
                                    : 'Fix the week below, then click Resubmit week.'}
                            </Text>
                        </>
                    }
                />
            )}
            {week.status === 'SUBMITTED' && (
                <Alert
                    type="info"
                    showIcon
                    message="Submitted — waiting for your manager's approval"
                    description="You can still edit; changes update the pending timesheet."
                />
            )}
            {lockedDays.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    message={lockedDays[0].lockReason}
                    description={`${lockedDays.length === 7 ? 'This whole week' : lockedDays.map(w => dayjs(w.date).format('ddd D MMM')).join(', ')} can be viewed but not edited.`}
                />
            )}
            {approved && pendingCr && !draft && (
                <Alert
                    type="warning"
                    showIcon
                    message={`Change request pending with your manager · ${diffSummary(diffEntries(base, week.entries))}`}
                    description={
                        <Flex vertical gap={4} align="start">
                            <Text className="text-xs">Reason: “{pendingCr.reason}”</Text>
                            <Text type="secondary" className="text-xs">
                                The approved version stays on record until your manager decides.
                                Editing again updates this request.
                            </Text>
                        </Flex>
                    }
                />
            )}
            {draft && (
                <ChangeRequestBar
                    reason={draft.reason}
                    base={base}
                    draft={draft.entries}
                    busy={ts.busy}
                    onEditReason={() => {
                        setReasonOpen(true);
                        reasonResolver.current = reason =>
                            reason && setDraft(d => (d ? { ...d, reason } : d));
                    }}
                    onDiscard={() => setDraft(null)}
                    onSubmit={submitDraft}
                />
            )}

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={16}>
                    <Flex vertical gap={10}>
                        {windows.map(w => (
                            <DayRow
                                key={w.date}
                                window={w}
                                entries={shown}
                                editable
                                marks={marks}
                                busy={ts.busy}
                                isFuture={w.date > today()}
                                onAdd={onAdd}
                                onUpdate={onUpdate}
                                onDelete={onDelete}
                                onRequestOvertime={(date, flagged) =>
                                    setOvertime({ date, flagged })
                                }
                                onBeforeEdit={approved && !draft ? ensureDraft : undefined}
                            />
                        ))}
                    </Flex>
                </Col>
                <Col xs={24} lg={8}>
                    <Flex vertical gap={16}>
                        <HoursSummaryCard windows={windows} entries={shown} />
                        <ChangeHistory history={week.history} />
                    </Flex>
                </Col>
            </Row>

            <ChangeReasonModal
                open={reasonOpen}
                initialReason={draft?.reason ?? pendingCr?.reason}
                updatingPending={!!pendingCr}
                onConfirm={reason => {
                    setReasonOpen(false);
                    reasonResolver.current?.(reason);
                    reasonResolver.current = null;
                }}
                onCancel={() => {
                    setReasonOpen(false);
                    reasonResolver.current?.(null);
                    reasonResolver.current = null;
                }}
            />

            <RequestOvertimeModal
                open={!!overtime}
                onClose={() => setOvertime(null)}
                onSubmit={requestOvertime}
                dateOfJoin={view.employee.dateOfJoin}
                initialValues={
                    overtime
                        ? {
                              date: overtime.date,
                              hours: overtimeHours(overtime),
                              notes: overtime.flagged.map(e => e.description).join('; '),
                          }
                        : undefined
                }
                extraContent={
                    overtime && (
                        <List
                            size="small"
                            bordered
                            header={
                                <Text className="text-xs font-medium">
                                    Entries outside your window
                                </Text>
                            }
                            dataSource={overtime.flagged}
                            renderItem={e => (
                                <List.Item className="!py-1 text-xs">
                                    {displayTime(e.start)}–{displayTime(e.end)} · {e.description}
                                </List.Item>
                            )}
                        />
                    )
                }
            />
        </Flex>
    );
};

export default MyTimesheet;
