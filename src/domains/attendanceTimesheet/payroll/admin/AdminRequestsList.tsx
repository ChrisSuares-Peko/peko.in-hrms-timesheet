// PROTOTYPE-SETUP (Payroll admin, Slices 1 and 5): the admin's requests list for one service (attendance corrections,
// leave, overtime, reimbursements, profile updates) — every employee, newest first.
//   filter ........ Waiting for you (default) · With approvers · Update requested · Approved · Rejected · All, with counts
//   waiting ....... Select all, a checkbox per row, "Approve selected (N)"; Approve / Ask for update / Reject on each row
//                   (Ask for update needs a comment and goes straight to the employee; on resubmit it starts again at
//                   the manager)
//   with approvers  read-only: "Waiting for {name}. You can decide once they approve." · Remind {first name} (mocked)
//                   PROTOTYPE-SETUP (Settings, Slice 1): whoever it's waiting with — the manager or a person named in
//                   settings; a team at level 1 is "Waiting for you" (Payroll decides).
//   update asked .. Remind employee (mocked)
// `extra` adds a chip per row (Leave: the department clash chip).
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { BellOutlined } from '@ant-design/icons';
import { Button, Checkbox, Empty, Flex, Segmented, Skeleton, Typography } from 'antd';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { notifyAdminChanged } from './adminShared';
import { bulkApproveAdmin, decideAdminRequest, getAdminRequests, remindAdminRequest } from '../../api';
import { approvedToast } from '../../components/approvalText';
import { PendingDecision, RequestCard, RequestDecisionModal } from '../../components/RequestQueue';
import type { AdminBucket, AdminRequestRow, AdminRequestType } from '../../types';
import { usePayrollScope } from '../usePayrollAts';

const { Text } = Typography;

type Filter = AdminBucket | 'all';

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'you', label: 'Waiting for you' },
    { key: 'mgr', label: 'With approvers' },
    { key: 'upd', label: 'Update requested' },
    { key: 'ok', label: 'Approved' },
    { key: 'no', label: 'Rejected' },
    { key: 'all', label: 'All' },
];

const SINGLE: Record<AdminRequestType, string> = {
    attendance: 'attendance correction',
    leave: 'leave request',
    overtime: 'overtime request',
    reimbursement: 'reimbursement claim',
    profile: 'profile update',
};

const AdminRequestsList = ({ type, extra, onChanged }: { type: AdminRequestType; extra?: (row: AdminRequestRow) => ReactNode; onChanged?: () => void }) => {
    const scope = usePayrollScope();
    const dispatch = useAppDispatch();
    const [rows, setRows] = useState<AdminRequestRow[] | null>(null);
    const [filter, setFilter] = useState<Filter>('you');
    const [sel, setSel] = useState<Record<string, boolean>>({});
    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState<PendingDecision | null>(null);
    const [comment, setComment] = useState('');
    const [commentError, setCommentError] = useState(false);

    const load = useCallback(async () => {
        const res = await getAdminRequests(scope, type);
        if (res) setRows(res);
        setSel({});
    }, [scope, type]);

    useEffect(() => {
        load();
    }, [load]);

    const changed = () => {
        load();
        notifyAdminChanged();
        onChanged?.();
    };

    const count = (f: Filter) => (rows ?? []).filter(r => f === 'all' || r.bucket === f).length;
    const list = (rows ?? []).filter(r => filter === 'all' || r.bucket === filter);
    const waiting = list.filter(r => r.bucket === 'you');
    const chosen = waiting.filter(r => sel[r.item.id]);
    const allOn = waiting.length > 0 && waiting.every(r => sel[r.item.id]);

    const approveSelected = async () => {
        setBusy(true);
        const res = await bulkApproveAdmin(scope, type, chosen.map(r => r.item.id));
        setBusy(false);
        if (!res) return;
        dispatch(
            showToast({
                variant: res.failed.length ? 'warning' : 'success',
                description: `${res.approved} approved${res.failed.length ? `. ${res.failed.length} couldn’t be approved: ${res.failed[0].reason}` : ''}`,
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
        const res = await decideAdminRequest(scope, type, pending.item.id, pending.decision, note || undefined);
        setBusy(false);
        if (!res) return;
        const done = { approve: approvedToast(res, 'Approved. This approval is final.'), reject: 'Request rejected', update: `Sent back to ${pending.item.employee.name} to update` };
        dispatch(showToast({ variant: 'success', description: done[pending.decision] }));
        setPending(null);
        changed();
    };

    const remind = async (row: AdminRequestRow) => {
        const res = await remindAdminRequest(scope, type, row.item.id);
        if (res) dispatch(showToast({ variant: 'success', description: res.message }));
    };

    if (!rows) return <Skeleton active paragraph={{ rows: 4 }} />;

    return (
        <Flex vertical gap={12} className="min-w-0" data-admin-requests={type}>
            <div className="max-w-full overflow-x-auto">
                <Segmented<Filter>
                    value={filter}
                    onChange={f => {
                        setFilter(f);
                        setSel({});
                    }}
                    options={FILTERS.map(f => ({ value: f.key, label: `${f.label} (${count(f.key)})` }))}
                    data-admin-filter
                />
            </div>
            {filter === 'you' && waiting.length > 0 && (
                <Flex align="center" gap={10} wrap="wrap" className="rounded-xl border border-solid border-[#EAECF0] bg-[#F9FAFB] px-3 py-2" data-bulk-bar>
                    <Checkbox
                        checked={allOn}
                        indeterminate={!allOn && chosen.length > 0}
                        onChange={e => setSel(e.target.checked ? Object.fromEntries(waiting.map(r => [r.item.id, true])) : {})}
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
                <div className="rounded-2xl border border-dashed border-[#EAECF0] py-10" data-admin-empty>
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                            <Flex vertical gap={2}>
                                <Text strong>{filter === 'you' ? 'Nothing waiting for you' : 'Nothing here'}</Text>
                                <Text type="secondary">{filter === 'you' ? 'Requests reach you after the employee’s manager approves them.' : 'Try another filter.'}</Text>
                            </Flex>
                        }
                    />
                </div>
            ) : (
                <Flex vertical gap={12}>
                    {list.map(r => (
                        <div key={r.item.id} className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] items-start gap-2" data-admin-row={r.bucket}>
                            {r.bucket === 'you' ? (
                                <Checkbox
                                    className="mt-5 justify-self-center"
                                    aria-label="Select"
                                    checked={Boolean(sel[r.item.id])}
                                    onChange={e => setSel({ ...sel, [r.item.id]: e.target.checked })}
                                />
                            ) : (
                                <span />
                            )}
                            <Flex vertical gap={6} className="min-w-0">
                                {(extra || r.bucket === 'mgr' || r.bucket === 'upd') && (
                                    <Flex align="center" gap={8} wrap="wrap">
                                        {extra?.(r)}
                                        <span className="flex-1" />
                                        {r.bucket === 'mgr' && (
                                            <>
                                                <Text type="secondary" className="text-xs" data-with-manager>
                                                    Waiting for {r.waitingWith ?? 'the approver'}. You can decide once they approve.
                                                </Text>
                                                <Button size="small" icon={<BellOutlined />} onClick={() => remind(r)} data-remind="manager">
                                                    Remind {(r.waitingWith ?? 'approver').split(' ')[0]}
                                                </Button>
                                            </>
                                        )}
                                        {r.bucket === 'upd' && (
                                            <Button size="small" icon={<BellOutlined />} onClick={() => remind(r)} data-remind="employee">
                                                Remind employee
                                            </Button>
                                        )}
                                    </Flex>
                                )}
                                <RequestCard
                                    item={r.item}
                                    onDecide={d => {
                                        setPending({ item: r.item, decision: d });
                                        setComment('');
                                        setCommentError(false);
                                    }}
                                />
                            </Flex>
                        </div>
                    ))}
                </Flex>
            )}
            <RequestDecisionModal
                pending={pending}
                busy={busy}
                comment={comment}
                commentError={commentError}
                single={SINGLE[type]}
                onComment={c => {
                    setComment(c);
                    if (c.trim()) setCommentError(false);
                }}
                onConfirm={confirm}
                onClose={() => setPending(null)}
            />
        </Flex>
    );
};

export default AdminRequestsList;
