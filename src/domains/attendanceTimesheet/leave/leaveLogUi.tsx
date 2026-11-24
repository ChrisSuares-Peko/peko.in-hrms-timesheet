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
import { COMP_OFF, COUNT_LABEL, fmtDays, limitText, typeLabel } from '@src/prototype/rules/leave';
import type { LeaveLogRow, LogItemKind, LogStatus } from '@src/prototype/rules/leaveLog';

import type { LeaveBalance, LeaveTypeConfig } from '../types';

const { Text } = Typography;

/** "6 / 18 days" — comp off has no yearly total: what's been earned (and not expired). */
export const availableOfTotal = (b: LeaveBalance) => `${fmtDays(b.available)} / ${fmtDays(b.type === COMP_OFF ? b.credited : b.allocated)} days`;

/**
 * PROTOTYPE-SETUP (Design update: Peko design language, rule 14): a leave balance card — the name in 13px grey,
 * "available / total days" with the available number 22px medium and the rest 13px grey, "View details ›" as a red link.
 */
export const TypeCard = ({ b, onOpen }: { b: LeaveBalance; onOpen: () => void }) => (
    <button
        type="button"
        onClick={onOpen}
        aria-label={`${b.label}: ${availableOfTotal(b)} available. View details`}
        className="flex min-w-0 cursor-pointer flex-col items-start gap-1 rounded-lg border border-solid border-[var(--peko-border)] bg-white p-4 text-left font-[inherit] shadow-[0px_1px_12px_1px_rgba(122,122,122,0.06)] transition-[border-color,box-shadow] hover:border-[var(--peko-primary-border)] hover:shadow-[0px_4px_16px_2px_rgba(122,122,122,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--peko-primary)] sm:px-5"
        data-type-card={b.type}
    >
        <Text className="w-full truncate text-[13px] !text-[var(--peko-muted)]">{b.label}</Text>
        <Text className="whitespace-nowrap tabular-nums" data-available-total>
            <span className="text-[22px] font-medium leading-7 text-[var(--peko-text)]">{fmtDays(b.available)}</span>
            <span className="text-[13px] text-[var(--peko-muted)]"> / {fmtDays(b.type === COMP_OFF ? b.credited : b.allocated)} days</span>
        </Text>
        <span className="mt-0.5 text-[13px] font-medium text-[var(--peko-primary)]">View details ›</span>
    </button>
);

/**
 * PROTOTYPE-SETUP (Leave policy settings; notes ess:leave:overview): a per-event type as a grey info card — no balance,
 * just "Up to 7 days per event · Working days · apply when needed".
 */
export const EventTypeCard = ({ t, onApply }: { t: LeaveTypeConfig; onApply: () => void }) => (
    <div className="flex min-w-0 flex-col items-start gap-1 rounded-lg border border-solid border-[var(--peko-border)] bg-[var(--peko-subtle)] p-4 sm:px-5" data-event-card={t.id}>
        <Text className="w-full truncate text-[13px] !text-[var(--peko-muted)]">{typeLabel(t.name)}</Text>
        <Text className="text-sm font-medium !text-[var(--peko-text)]">Up to {limitText(t)} per event</Text>
        <Text className="text-[13px] !text-[var(--peko-muted)]">{COUNT_LABEL[t.count]} · apply when needed</Text>
        <button type="button" onClick={onApply} className="mt-0.5 cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--peko-primary)] font-[inherit]">
            Apply ›
        </button>
    </div>
);

/**
 * PROTOTYPE-SETUP (Leave policy settings): the overview's one card grid. Desktop (lg and up), by the number of leave
 * cards N: N ≤ 2 → one row of 4, the side cards at the right end; 3–4 → 3 columns, leave cards 2×2 on the left, side
 * cards stacked in the right column; 5+ → 4 columns, leave cards 3 a row on the left (more rows for 7+), side cards
 * stacked at the top of the right column. Phones and small tablets: 2 columns, side cards after the leave cards. Cards
 * in a row share a height (grid stretch).
 */
export const OverviewGrid = ({ leaveCards, side, desktop }: { leaveCards: ReactNode[]; side: [ReactNode, ReactNode]; desktop: boolean }) => {
    const n = leaveCards.length;
    if (!desktop) {
        return (
            <div className="grid w-full grid-cols-2 gap-4" data-balance-cards data-overview-grid="2">
                {leaveCards}
                {side}
            </div>
        );
    }
    let cols = 4;
    if (n >= 3 && n <= 4) cols = 3;
    const left = n <= 2 ? 2 : cols - 1;
    const place = (i: number) => ({ gridColumn: (i % left) + 1, gridRow: Math.floor(i / left) + 1 });
    return (
        <div className="grid w-full gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} data-balance-cards data-overview-grid={cols}>
            {leaveCards.map((c, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="flex min-w-0 [&>*]:w-full" style={place(i)}>
                    {c}
                </div>
            ))}
            <div className="flex min-w-0 [&>*]:w-full" style={n <= 2 ? { gridColumn: 3, gridRow: 1 } : { gridColumn: cols, gridRow: 1 }} data-side-card="upcoming">
                {side[0]}
            </div>
            <div className="flex min-w-0 [&>*]:w-full" style={n <= 2 ? { gridColumn: 4, gridRow: 1 } : { gridColumn: cols, gridRow: 2 }} data-side-card="holiday">
                {side[1]}
            </div>
        </div>
    );
};

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
    if (r.days !== null) return <span className={`tabular-nums ${r.days < 0 ? 'text-[var(--peko-error-ink)]' : 'text-[#067647]'}`}>{signed(r.days)}</span>;
    if (r.plainDays !== undefined) return <span className="tabular-nums text-[var(--peko-muted)]">{fmtDays(r.plainDays)}</span>;
    return <span className="text-[var(--peko-muted)]">–</span>;
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
    const period = { title: 'Period', key: 'period', render: (_: unknown, r: LeaveLogRow) => r.period || <span className="text-[var(--peko-muted)]">–</span> };
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
        <div className="min-w-0 overflow-hidden rounded-lg border border-solid border-[var(--peko-border)] bg-white">
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
            <h3 className="m-0 text-base font-medium text-[var(--peko-text)]">{title}</h3>
            {extra}
        </div>
        {children}
    </section>
);
