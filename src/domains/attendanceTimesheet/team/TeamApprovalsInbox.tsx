// PROTOTYPE-SETUP (My team, Slice 3): My team → Approvals — one inbox for everything waiting for the manager (level 1)
// from their direct reports: timesheets, attendance corrections, overtime, leave and reimbursements.
//   filter ......... All / Timesheets / Attendance / Overtime / Leave / Reimbursements, each with its count (types the
//                    company's mode doesn't use are left out)
//   bulk ........... "Select all", a checkbox per item, "Approve selected (N)" — each moves on as a single approval would
//   timesheet ...... employee, period, hours logged, "Edited" when edited after approval, Review (the review screen:
//                    "What changed", Approve, Ask for update)
//   request ........ the request card with Approve, Ask for update, Reject
// Ask for update always goes straight back to the employee; when they resubmit, it comes back here.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Checkbox, Empty, Flex, Segmented, Skeleton, Tag, Typography } from 'antd';

import { useAppDispatch } from '@src/hooks/store';
import { hasCheckIn, hasTimesheets, hasTracking } from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import { AtsRequestType, bulkApproveTeam, decideTeamRequest, getTeamRequests, getTimesheetQueue } from '../api';
import { PersonCell, TeamSettings } from './teamShared';
import TimesheetReviewDrawer, { ReviewTarget } from './TimesheetReviewDrawer';
import { approvedToast } from '../components/approvalText';
import {
    fmtPeriod,
    formatDuration,
} from '../components/format';
import { PendingDecision, RequestCard, RequestDecisionModal } from '../components/RequestQueue';
import { useAtsScope } from '../hooks/useAtsScope';
import type { RequestItem, TimesheetApprovalItem } from '../types';

const { Text } = Typography;

type Kind = 'timesheet' | AtsRequestType;
type Filter = 'all' | Kind;

interface InboxItem {
    key: string;
    kind: Kind;
    at: string;
    ts?: TimesheetApprovalItem;
    req?: RequestItem;
}

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'timesheet', label: 'Timesheets' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'leave', label: 'Leave' },
    { key: 'reimbursement', label: 'Reimbursements' },
];

const SINGLE: Record<AtsRequestType, string> = {
    attendance: 'attendance correction',
    overtime: 'overtime request',
    leave: 'leave request',
    reimbursement: 'reimbursement claim',
};

/** The types this company's mode has (and whether timesheet approval is on). */
export const inboxKinds = (settings: Pick<TeamSettings, 'mode' | 'approvalOn'>): Kind[] =>
    [
        settings.approvalOn && hasTimesheets(settings.mode) && ('timesheet' as const),
        hasCheckIn(settings.mode) && ('attendance' as const),
        hasTracking(settings.mode) && ('overtime' as const),
        'leave' as const,
        'reimbursement' as const,
    ].filter((k): k is Kind => Boolean(k));

const TeamApprovalsInbox = ({ settings, onChanged }: { settings: TeamSettings; onChanged?: () => void }) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [items, setItems] = useState<InboxItem[] | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const [sel, setSel] = useState<Record<string, boolean>>({});
    const [busy, setBusy] = useState(false);
    const [review, setReview] = useState<ReviewTarget | null>(null);
    const [pending, setPending] = useState<PendingDecision | null>(null);
    const [comment, setComment] = useState('');
    const [commentError, setCommentError] = useState(false);
    const kinds = useMemo(() => inboxKinds(settings), [settings]);

    const load = useCallback(async () => {
        const reqKinds = kinds.filter((k): k is AtsRequestType => k !== 'timesheet');
        const [ts, ...reqs] = await Promise.all([
            kinds.includes('timesheet') ? getTimesheetQueue(scope, 'waiting') : Promise.resolve([] as TimesheetApprovalItem[]),
            ...reqKinds.map(k => getTeamRequests(scope, k, 'waiting')),
        ]);
        const next: InboxItem[] = [
            ...(ts || []).map(t => ({ key: `ts:${t.employee.id}:${t.weekStart}`, kind: 'timesheet' as const, at: t.at, ts: t })),
            ...reqs.flatMap((list, i) => (list || []).map(r => ({ key: `${reqKinds[i]}:${r.id}`, kind: reqKinds[i], at: r.at, req: r }))),
        ].sort((a, b) => b.at.localeCompare(a.at));
        setItems(next);
        setSel({});
    }, [scope, kinds]);

    useEffect(() => {
        if (settings.loaded) load();
    }, [settings.loaded, load]);

    const changed = () => {
        load();
        onChanged?.();
    };

    const count = (f: Filter) => (items ?? []).filter(x => f === 'all' || x.kind === f).length;
    const list = (items ?? []).filter(x => filter === 'all' || x.kind === filter);
    const chosen = list.filter(x => sel[x.key]);
    const allOn = list.length > 0 && list.every(x => sel[x.key]);

    const approveSelected = async () => {
        setBusy(true);
        const res = await bulkApproveTeam(
            scope,
            chosen.map(x => (x.ts ? { kind: 'timesheet' as const, employeeId: x.ts.employee.id, weekStart: x.ts.weekStart } : { kind: x.kind as AtsRequestType, id: x.req!.id }))
        );
        setBusy(false);
        if (!res) return;
        const n = res.approved;
        dispatch(
            showToast({
                variant: res.failed.length ? 'warning' : 'success',
                description: `${n} item${n === 1 ? '' : 's'} approved and sent to level 2${res.failed.length ? `. ${res.failed.length} couldn’t be approved: ${res.failed[0].reason}` : ''}`,
            })
        );
        changed();
    };

    const confirm = async () => {
        if (!pending) return;
        const note = comment.trim();
        if (pending.decision !== 'approve' && !note) {
            setCommentError(true);
            return;
        }
        setBusy(true);
        const res = await decideTeamRequest(scope, pending.item.type as AtsRequestType, pending.item.id, pending.decision, note || undefined);
        setBusy(false);
        if (!res) return;
        const done = { approve: approvedToast(res), reject: 'Request rejected', update: `Sent back to ${pending.item.employee.name} to update` };
        dispatch(showToast({ variant: 'success', description: done[pending.decision] }));
        setPending(null);
        changed();
    };

    if (!items) {
        return (
            <Flex vertical gap={12}>
                {[0, 1, 2].map(i => (
                    <Skeleton key={i} active avatar paragraph={{ rows: 2 }} />
                ))}
            </Flex>
        );
    }

    return (
        <Flex vertical gap={12} data-team-approvals>
            <Segmented<Filter>
                className="max-w-full self-start overflow-x-auto"
                value={filter}
                onChange={f => {
                    setFilter(f);
                    setSel({});
                }}
                options={FILTERS.filter(f => f.key === 'all' || kinds.includes(f.key)).map(f => ({ value: f.key, label: `${f.label} (${count(f.key)})` }))}
            />
            {list.length > 0 && (
                <Flex align="center" gap={10} wrap="wrap" className="rounded-xl border border-solid border-[#EAECF0] bg-[#F9FAFB] px-3 py-2" data-bulk-bar>
                    <Checkbox
                        checked={allOn}
                        indeterminate={!allOn && chosen.length > 0}
                        onChange={e => setSel(e.target.checked ? Object.fromEntries(list.map(x => [x.key, true])) : {})}
                    >
                        Select all
                    </Checkbox>
                    <span className="flex-1" />
                    <Button type="primary" disabled={!chosen.length} loading={busy && chosen.length > 0} onClick={approveSelected} data-approve-selected>
                        Approve selected{chosen.length ? ` (${chosen.length})` : ''}
                    </Button>
                </Flex>
            )}
            {list.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#EAECF0] py-10">
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <Flex vertical gap={2}>
                                <Text strong>You’re all caught up</Text>
                                <Text type="secondary">Anything your team sends for approval shows up here. Requests wait for you, even while you’re on leave.</Text>
                            </Flex>
                        }
                    />
                </div>
            ) : (
                <Flex vertical gap={12}>
                    {list.map(x => (
                        <div key={x.key} className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] items-start gap-2" data-inbox-item={x.kind}>
                            <Checkbox
                                className="mt-5 justify-self-center"
                                aria-label="Select"
                                checked={Boolean(sel[x.key])}
                                onChange={e => setSel({ ...sel, [x.key]: e.target.checked })}
                            />
                            {x.ts ? (
                                <div className="rounded-2xl border border-solid border-[#FECDCA] bg-white p-4">
                                    <Flex gap={12} justify="space-between" align="flex-start" wrap="wrap">
                                        <Flex vertical gap={6} className="min-w-0 flex-1 basis-[240px]">
                                            <PersonCell person={x.ts.employee} />
                                            <Flex gap={6} align="center" wrap="wrap">
                                                <Tag color="blue" className="!m-0">
                                                    Timesheet
                                                </Tag>
                                                <Text strong>{fmtPeriod(x.ts.weekStart, x.ts.periodEnd)}</Text>
                                            </Flex>
                                            <Text type="secondary" className="text-sm">
                                                {formatDuration(x.ts.loggedMinutes)} logged
                                                {x.ts.editedAfter ? ` · edited after it was ${x.ts.editedAfter === 'APPROVED' ? 'approved' : 'sent'}` : ''}
                                                {x.ts.diffSummary ? ` · ${x.ts.diffSummary}` : ''}
                                            </Text>
                                        </Flex>
                                        <Flex gap={8} align="center">
                                            {x.ts.editedAfter && (
                                                <Tag color="gold" className="!m-0">
                                                    Edited
                                                </Tag>
                                            )}
                                            <Button type="primary" onClick={() => setReview({ employeeId: x.ts!.employee.id, date: x.ts!.weekStart })}>
                                                Review
                                            </Button>
                                        </Flex>
                                    </Flex>
                                </div>
                            ) : (
                                <RequestCard
                                    item={x.req!}
                                    onDecide={d => {
                                        setPending({ item: x.req!, decision: d });
                                        setComment('');
                                        setCommentError(false);
                                    }}
                                />
                            )}
                        </div>
                    ))}
                </Flex>
            )}
            <Text type="secondary" className="text-xs">
                Approving sends it on to Payroll for level 2. “Ask for update” sends it straight back to the employee; when they resubmit, it comes back to you.
            </Text>
            <RequestDecisionModal
                pending={pending}
                busy={busy}
                comment={comment}
                commentError={commentError}
                single={pending ? SINGLE[pending.item.type as AtsRequestType] ?? 'request' : 'request'}
                onComment={c => {
                    setComment(c);
                    if (c.trim()) setCommentError(false);
                }}
                onConfirm={confirm}
                onClose={() => setPending(null)}
            />
            <TimesheetReviewDrawer target={review} onClose={() => setReview(null)} onDecided={changed} />
        </Flex>
    );
};

export default TeamApprovalsInbox;
