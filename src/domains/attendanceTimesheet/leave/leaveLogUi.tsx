// PROTOTYPE-SETUP (Leave module, update): the ESS Leave overview's compact cards and the leave log tables.
//   TypeCard ........ one leave type: name, "available / total days", View details. Nothing else.
//   LeaveLogTable ... Recent activity (Date · Leave type · What happened · Period · Days · Status) or a type's log
//                     (Date · Entry · Period · Days · Status · Reason). Leave rows open the request drawer.
// Rows come from src/prototype/rules/leaveLog.ts.
import type { ReactNode } from 'react';

import { Empty, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import StatusTag from '@src/components/peko/StatusTag';
import { COMP_OFF, fmtDays } from '@src/prototype/rules/leave';
import type { LeaveLogRow, LogItemKind, LogStatus } from '@src/prototype/rules/leaveLog';

import type { LeaveBalance } from '../types';

const { Text } = Typography;

/** "6 / 18 days" — comp off has no yearly total: what's been earned (and not expired). */
export const availableOfTotal = (b: LeaveBalance) => `${fmtDays(b.available)} / ${fmtDays(b.type === COMP_OFF ? b.credited : b.allocated)} days`;

export const TypeCard = ({ b, onOpen }: { b: LeaveBalance; onOpen: () => void }) => (
    <button
        type="button"
        onClick={onOpen}
        aria-label={`${b.label}: ${availableOfTotal(b)} available. View details`}
        className="flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg border border-solid border-[#eff1f4] bg-white px-4 py-3 text-left transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF3A3A]"
        data-type-card={b.type}
    >
        <Text className="truncate text-sm text-gray-600">{b.label}</Text>
        <Text className="text-xl font-semibold tabular-nums text-[#121212]" data-available-total>
            {availableOfTotal(b)}
        </Text>
        <span className="text-xs font-medium text-[#FF3A3A]">View details ›</span>
    </button>
);

const STATUS_COLOR: Record<LogStatus, string> = {
    in_progress: 'processing',
    approved: 'success',
    rejected: 'error',
    withdrawn: 'default',
    cancelled: 'default',
    credited: 'green',
    deducted: 'orange',
    reversed: 'green',
    lapsed: 'default',
    expired: 'default',
};

const signed = (n: number) => (n > 0 ? `+${fmtDays(n)}` : `−${fmtDays(-n)}`);

const DaysCell = ({ r }: { r: LeaveLogRow }) => {
    if (r.days !== null) return <span className={`tabular-nums ${r.days < 0 ? 'text-[#B42318]' : 'text-[#067647]'}`}>{signed(r.days)}</span>;
    if (r.plainDays !== undefined) return <span className="tabular-nums text-gray-400">{fmtDays(r.plainDays)}</span>;
    return <span className="text-gray-400">–</span>;
};

export const LogStatusTag = ({ r }: { r: Pick<LeaveLogRow, 'status' | 'statusKind'> }) => (
    <StatusTag color={STATUS_COLOR[r.statusKind]} className="!m-0" data-log-status={r.statusKind}>
        {r.status}
    </StatusTag>
);

export const LeaveLogTable = ({
    rows,
    mode,
    onOpen,
    empty,
    pageSize,
}: {
    rows: LeaveLogRow[];
    mode: 'activity' | 'type';
    onOpen: (it: { kind: LogItemKind; id: string }) => void;
    empty: string;
    pageSize?: number;
}) => {
    const date = { title: 'Date', key: 'date', render: (_: unknown, r: LeaveLogRow) => <span className="whitespace-nowrap">{dayjs(r.date).format('D MMM YYYY')}</span> };
    const period = { title: 'Period', key: 'period', render: (_: unknown, r: LeaveLogRow) => r.period || <span className="text-gray-400">–</span> };
    const days = { title: 'Days (+/−)', key: 'days', align: 'right' as const, render: (_: unknown, r: LeaveLogRow) => <DaysCell r={r} /> };
    const status = { title: 'Status', key: 'status', render: (_: unknown, r: LeaveLogRow) => <LogStatusTag r={r} /> };
    const columns: ColumnsType<LeaveLogRow> =
        mode === 'activity'
            ? [
                  date,
                  { title: 'Leave type', key: 'type', render: (_, r) => <span className="whitespace-nowrap">{r.typeName}</span> },
                  { title: 'What happened', key: 'what', render: (_, r) => <span className="block max-w-[320px] whitespace-normal">{r.what}</span> },
                  period,
                  days,
                  status,
              ]
            : [
                  date,
                  { title: 'Entry', key: 'entry', render: (_, r) => <span className="whitespace-nowrap font-medium">{r.entry}</span> },
                  period,
                  days,
                  status,
                  { title: 'Reason', key: 'reason', render: (_, r) => <span className="block max-w-[260px] whitespace-normal break-words">{r.reason || '–'}</span> },
              ];
    return (
        <div className="min-w-0 overflow-hidden rounded-lg border border-solid border-[#eff1f4] bg-white">
            <Table<LeaveLogRow>
                rowKey="key"
                size="middle"
                columns={columns}
                dataSource={rows}
                pagination={pageSize && rows.length > pageSize ? { pageSize, showSizeChanger: false, size: 'small' } : false}
                scroll={{ x: 'max-content' }}
                rowClassName={r => (r.open ? 'cursor-pointer' : '')}
                onRow={r => ({
                    onClick: () => r.open && onOpen(r.open),
                    onKeyDown: e => {
                        if (r.open && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            onOpen(r.open);
                        }
                    },
                    tabIndex: r.open ? 0 : undefined,
                    'data-log-row': r.open ? `${r.open.kind}:${r.open.id}` : r.key,
                })}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} /> }}
                data-leave-log={mode}
            />
        </div>
    );
};

/** A section card with a heading. */
export const LeaveSection = ({ title, children, extra, label }: { title: string; children: ReactNode; extra?: ReactNode; label?: string }) => (
    <section aria-label={label ?? title} className={`${ESS_CARD} flex min-w-0 flex-col gap-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-base font-medium text-[#121212]">{title}</h3>
            {extra}
        </div>
        {children}
    </section>
);
