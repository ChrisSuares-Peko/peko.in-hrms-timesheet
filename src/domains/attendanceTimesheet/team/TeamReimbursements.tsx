// PROTOTYPE-SETUP (Leave & team, Slice 4): My team → Team reimbursements — the direct reports' claims for a month (by
// expense date):
//   month switcher ‹ October 2026 ›
//   four totals (₹ + count) .. Claimed this month · Waiting for you · With Admin (the level-2 approver) · Approved
//   By team member ........... each person's claims and total for the month
//   status filter ............ All / Waiting for you / With Admin / Update requested / Approved / Rejected, with counts
//   the claims ............... waiting for the manager: Approve / Ask for update / Reject; others: status and chain
import { useCallback, useEffect, useState } from 'react';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Empty, Flex, Segmented, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { addMonths } from '@src/prototype/rules/attendance';

import { getTeamReimbursements } from '../api';
import { PersonCell } from './teamShared';
import { useTeamDecision } from './useTeamDecision';
import { RequestCard } from '../components/RequestQueue';
import { useAtsScope } from '../hooks/useAtsScope';
import type { TeamClaimBucket, TeamReimbursementsView } from '../types';

const { Text } = Typography;

type Filter = 'all' | TeamClaimBucket;

/** ₹12,345 */
export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const claimsText = (n: number) => `${n} claim${n === 1 ? '' : 's'}`;

const Total = ({ label, total, accent }: { label: string; total: { amount: number; count: number }; accent?: string }) => (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[20px] border border-solid border-[#e6e6e6] bg-white px-4 py-3" data-reimb-total={label}>
        <Text type="secondary" className="text-xs">
            {label}
        </Text>
        <Text className="truncate text-xl font-semibold tabular-nums" style={{ color: accent ?? '#171717' }}>
            {inr(total.amount)}
        </Text>
        <Text type="secondary" className="text-xs">
            {claimsText(total.count)}
        </Text>
    </div>
);

const TeamReimbursements = ({ onChanged }: { onChanged?: () => void }) => {
    const scope = useAtsScope();
    const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
    const [view, setView] = useState<TeamReimbursementsView | null>(null);
    const [filter, setFilter] = useState<Filter>('all');

    const load = useCallback(async () => {
        const res = await getTeamReimbursements(scope, month);
        if (res) setView(res);
    }, [scope, month]);

    useEffect(() => {
        setView(null);
        load();
    }, [load]);

    const { start, modal } = useTeamDecision(() => {
        load();
        onChanged?.();
    });

    const monthLabel = dayjs(`${month}-01`).format('MMMM YYYY');
    const count = (f: Filter) => (view?.claims ?? []).filter(c => f === 'all' || c.bucket === f).length;
    const list = (view?.claims ?? []).filter(c => filter === 'all' || c.bucket === filter);
    const l2 = view?.level2Label ?? 'Admin';
    const FILTERS: { key: Filter; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'you', label: 'Waiting for you' },
        { key: 'l2', label: `With ${l2}` },
        { key: 'upd', label: 'Update requested' },
        { key: 'ok', label: 'Approved' },
        { key: 'no', label: 'Rejected' },
    ];

    return (
        <Flex vertical gap={14} className="min-w-0" data-team-reimbursements>
            <Flex align="center" gap={8} wrap="wrap">
                <Button size="small" icon={<LeftOutlined />} aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))} />
                <Text className="min-w-[120px] text-center font-medium" data-reimb-month>
                    {monthLabel}
                </Text>
                <Button size="small" icon={<RightOutlined />} aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))} />
            </Flex>
            {!view ? (
                <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Total label="Claimed this month" total={view.totals.claimed} />
                        <Total label="Waiting for you" total={view.totals.waiting} accent={view.totals.waiting.count ? '#B42318' : undefined} />
                        <Total label={`With ${l2}`} total={view.totals.withLevel2} />
                        <Total label="Approved" total={view.totals.approved} accent={view.totals.approved.count ? '#067647' : undefined} />
                    </div>
                    {view.byPerson.length > 0 && (
                        <section aria-label="By team member" className={`${ESS_CARD} !py-4`}>
                            <h3 className="mb-2 mt-0 text-base font-medium text-gray-900">By team member</h3>
                            {view.byPerson.map(p => (
                                <div key={p.employee.id} className="flex items-center justify-between gap-3 border-0 border-b border-solid border-gray-100 py-2 last:border-b-0" data-reimb-person>
                                    <span className="flex min-w-0 items-center gap-2">
                                        <PersonCell person={p.employee} />
                                        <Text type="secondary" className="whitespace-nowrap text-xs">
                                            · {claimsText(p.count)}
                                        </Text>
                                    </span>
                                    <Text className="whitespace-nowrap font-medium tabular-nums">{inr(p.amount)}</Text>
                                </div>
                            ))}
                        </section>
                    )}
                    <div className="max-w-full self-start overflow-x-auto">
                        <Segmented<Filter>
                            value={filter}
                            onChange={setFilter}
                            options={FILTERS.map(f => ({ value: f.key, label: `${f.label} (${count(f.key)})` }))}
                            data-reimb-filter
                        />
                    </div>
                    {list.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[#EAECF0] py-10" data-reimb-empty>
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <Flex vertical gap={2}>
                                        <Text strong>No claims here</Text>
                                        <Text type="secondary">Reimbursement claims from your team for {monthLabel} show up here.</Text>
                                    </Flex>
                                }
                            />
                        </div>
                    ) : (
                        <Flex vertical gap={12}>
                            {list.map(c => (
                                <div key={c.item.id} data-reimb-claim={c.bucket}>
                                    <RequestCard item={c.item} onDecide={d => start(c.item, d)} />
                                </div>
                            ))}
                        </Flex>
                    )}
                </>
            )}
            {modal}
        </Flex>
    );
};

export default TeamReimbursements;
