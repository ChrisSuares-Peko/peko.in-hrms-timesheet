// PROTOTYPE-SETUP (Leave module): the leave building blocks shared by ESS → Leaves, Payroll → Leave and My team.
//   BalanceCard ........... "{Type} leave" · "{n} available" · "{c} credited so far of {a} this year (incl. carried)" ·
//                           "{x} taken · {y} in request · −{z} late · next +1 on 1 Dec" — opens the type's page
//                           (onOpen), or shows its credits and deductions inline
//   LedgerList ............ credits and deductions, newest first (green +, grey −, info rows muted)
//   LossOfPayCard ......... only when late check-ins ran past every balance
//   LateDeductionsPanel ... "Late check-in deductions": the rule, then one row per late check-in this leave year
//   ProbationBanner / ExitBanner, statusTag, leave dates and labels
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Alert, Button, Typography } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import StatusTag from '@src/components/peko/StatusTag';
import { formatDuration } from '@src/prototype/rules/attendance';
import { COMP_OFF, daysText, fmtDays, lateDeductionIntro, lateLedgerText } from '@src/prototype/rules/leave';

import type { LeaveBalance, LeaveHalf, LeaveRequestRow, LeaveView, LedgerEntry } from '../types';

const { Text } = Typography;

/** "Tue 13 Oct" */
export const fmtDay = (iso: string) => dayjs(iso).format('ddd D MMM');
/** "13 Oct 2026" */
export const fmtLong = (iso: string) => dayjs(iso).format('D MMM YYYY');
/** "Tue 13 Oct – Fri 16 Oct" / "Tue 13 Oct" */
export const fmtRange = (start: string, end: string) => (end > start ? `${fmtDay(start)} – ${fmtDay(end)}` : fmtDay(start));
/** "First half" / "Second half" / "Full day" */
export const dayTypeText = (half: LeaveHalf | null) => {
    if (half === 'FIRST') return 'First half';
    if (half === 'SECOND') return 'Second half';
    return 'Full day';
};
/** "(first half)" / "(first half of each day)" */
export const halfSuffix = (half: LeaveHalf | null, multi: boolean) => (half ? ` (${half === 'FIRST' ? 'first' : 'second'} half${multi ? ' of each day' : ''})` : '');

/** "Leave year 1 Apr 2026 – 31 Mar 2027 · company leave cycle" */
export const leaveYearLine = (v: Pick<LeaveView, 'year'>) =>
    `Leave year ${fmtLong(v.year.start)} – ${fmtLong(v.year.end)} · ${v.year.basis === 'COMPANY' ? 'company leave cycle' : 'based on the joining date'}`;

const signed = (n: number) => (n > 0 ? `+${fmtDays(n)}` : `−${fmtDays(-n)}`);

/** The status chip of a leave request. */
export const LeaveStatusTag = ({ r }: { r: Pick<LeaveRequestRow, 'state' | 'statusLabel'> }) => {
    const color = { approved: 'success', rejected: 'error', withdrawn: 'default', cancelled: 'default', update_requested: 'warning', pending: 'processing' }[r.state];
    return (
        <StatusTag color={color} className="!m-0" data-leave-state={r.state}>
            {r.statusLabel}
        </StatusTag>
    );
};

export const LedgerList = ({ ledger, empty = 'Nothing credited or deducted yet this year.' }: { ledger: LedgerEntry[]; empty?: string }) =>
    ledger.length ? (
        <ul className="m-0 list-none p-0" data-ledger>
            {ledger.map((x, i) => (
                <li key={`${x.date}-${x.kind}-${i}`} className="flex items-baseline justify-between gap-3 border-0 border-t border-solid border-[#F0F0F0] py-1.5 text-xs first:border-t-0">
                    <span className={x.amount === null ? 'text-[#8B8B8B]' : 'text-[#121212]'}>
                        {dayjs(x.date).format('D MMM')} · {x.text}
                    </span>
                    {x.amount !== null && <span className={`shrink-0 tabular-nums ${x.amount < 0 ? 'text-[#B42318]' : 'text-[#067647]'}`}>{signed(x.amount)}</span>}
                </li>
            ))}
        </ul>
    ) : (
        <Text type="secondary" className="text-xs">
            {empty}
        </Text>
    );

/** The card's small lines: probation, credited so far, taken / in request / late / next. */
const balanceLines = (b: LeaveBalance, onProbation: boolean) => {
    const probation: ReactNode = (() => {
        if (!onProbation || b.type === COMP_OFF) return null;
        if (b.probation === 'NONE')
            return (
                <Text className="text-xs !text-[#B54708]" data-not-available>
                    Available once you’re confirmed
                </Text>
            );
        if (b.probation === 'MONTHLY') return <Text className="text-xs text-[#8B8B8B]">Credited monthly during probation</Text>;
        return null;
    })();
    const extra = [
        `${fmtDays(b.approved)} taken`,
        b.inRequest > 0 ? `${fmtDays(b.inRequest)} in request` : '',
        b.late > 0 ? `−${fmtDays(b.late)} late` : '',
        b.type === COMP_OFF && b.expiring ? `${fmtDays(b.expiring.amount)} expires ${dayjs(b.expiring.date).format('D MMM')}` : '',
        b.credit === 'DAILY' ? 'accrues daily' : '',
        b.next ? `next +${fmtDays(b.next.amount)} on ${dayjs(b.next.date).format('D MMM')}` : '',
    ].filter(Boolean);
    return { probation, extra };
};

export const BalanceCard = ({ b, onProbation = false, onOpen }: { b: LeaveBalance; onProbation?: boolean; onOpen?: () => void }) => {
    const [open, setOpen] = useState(false);
    const { probation, extra } = balanceLines(b, onProbation);
    const body = (
        <>
            <Text className="text-sm text-[#595959]">{b.label}</Text>
            <Text className="text-2xl font-semibold text-[#121212]" data-available>
                {fmtDays(b.available)} available
            </Text>
            {probation}
            <Text className="text-xs text-[#595959]">
                {b.type === COMP_OFF ? `${fmtDays(b.credited)} earned and not expired` : `${fmtDays(b.credited)} credited so far of ${fmtDays(b.allocated)} this year`}
                {b.carried > 0 ? ` (incl. ${fmtDays(b.carried)} carried forward)` : ''}
            </Text>
            <Text className="text-xs text-[#8B8B8B]">{extra.join(' · ')}</Text>
        </>
    );
    if (onOpen) {
        return (
            <button
                type="button"
                aria-label={`${b.label}: ${fmtDays(b.available)} available. View details`}
                onClick={onOpen}
                className={`${ESS_CARD} flex cursor-pointer flex-col gap-1 border-0 text-left transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF3A3A]`}
                data-balance={b.type}
            >
                {body}
                <span className="mt-1 text-sm font-medium text-[#FF3A3A]">View details ›</span>
            </button>
        );
    }
    return (
        <section aria-label={b.label} className={`${ESS_CARD} flex flex-col gap-1`} data-balance={b.type}>
            {body}
            <Button type="link" size="small" className="!h-auto self-start !p-0" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                {open ? 'Hide credits and deductions' : 'Credits and deductions'}
            </Button>
            {open && <LedgerList ledger={b.ledger} />}
        </section>
    );
};

export const LossOfPayCard = ({ days }: { days: number }) =>
    days > 0 ? (
        <section aria-label="Loss of pay" className="rounded-lg border border-solid border-[#FECDCA] bg-[#FEF3F2] p-4 sm:p-6" data-lop-card>
            <Text className="block text-sm text-[#B42318]">Loss of pay</Text>
            <Text className="block text-2xl font-semibold text-[#B42318]">{daysText(days)}</Text>
            <Text className="block text-xs text-[#B42318]">From late check-ins with no leave left</Text>
        </section>
    ) : null;

/** "Late check-in deductions": the rule, then each late check-in this leave year (reversed ones in green). */
export const LateDeductionsPanel = ({ view }: { view: LeaveView }) => {
    const off = !view.lateDeductionDays;
    if (off && !view.lateDeductions.length) return null;
    const firstName = view.balances.find(b => b.type === view.lateOrder[0])?.name ?? 'Annual';
    return (
        <section aria-label="Late check-in deductions" className={ESS_CARD} data-late-panel>
            <h3 className="m-0 text-base font-medium text-[#121212]">Late check-in deductions</h3>
            <Text type="secondary" className="mt-1 block text-xs">
                {off ? 'Late check-ins don’t deduct leave at your company.' : lateDeductionIntro(view.lateDeductionDays, firstName)}
            </Text>
            {view.lateDeductions.length === 0 && <Text className="mt-3 block text-sm text-[#8B8B8B]">No late check-ins this leave year.</Text>}
            {view.lateDeductions.length > 0 && (
                <ul className="m-0 mt-2 list-none p-0">
                    {view.lateDeductions.map(d => (
                        <li key={d.date} className="flex flex-wrap items-baseline justify-between gap-x-3 border-0 border-b border-solid border-[#F0F0F0] py-2 text-sm last:border-b-0">
                            <span className="text-[#121212]">
                                {fmtDay(d.date)} ·{' '}
                                {d.state === 'reversed' && d.reversedOn ? `dispute approved ${dayjs(d.reversedOn).format('D MMM')}` : `late by ${formatDuration(d.lateMinutes)}`}
                            </span>
                            <span className={`tabular-nums ${d.state === 'reversed' ? 'text-[#067647]' : 'text-[#404040]'}`}>{lateLedgerText(d)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export const ProbationBanner = ({ view, who }: { view: Pick<LeaveView, 'status'>; who?: string }) =>
    view.status === 'PROBATION' ? (
        <Alert
            type="info"
            showIcon
            data-probation
            message={
                who
                    ? `${who} is on probation. Each leave type follows its probation rule until HR marks them Active.`
                    : 'You’re on probation. Each leave type follows the company’s probation rule, shown on the cards below, until HR confirms you as a full employee.'
            }
        />
    ) : null;

/** "Leaving on Friday, 20 December. Leave is pro-rated to your last day. Annual: 3 unused days encashed …"; types set to
 *  bring the last working day forward say "Casual: 2 days can be used to bring your last working day forward." */
export const settlementText = (v: Pick<LeaveView, 'exit'>) => {
    if (!v.exit) return '';
    const parts = v.exit.settlement.flatMap(s => {
        const out: string[] = [];
        if (s.encash > 0) out.push(`${s.name}: ${fmtDays(s.encash)} unused ${s.encash <= 1 ? 'day' : 'days'} encashed in the final settlement.`);
        if (s.bringForward > 0) out.push(`${s.name}: ${daysText(s.bringForward)} can be used to bring your last working day forward.`);
        if (s.recover > 0) out.push(`${s.name}: ${daysText(s.recover)} more than earned, recovered in the final settlement.`);
        return out;
    });
    return `Leaving on ${dayjs(v.exit.date).format('dddd, D MMMM')}. Leave is pro-rated to the last day. ${parts.length ? parts.join(' ') : 'Nothing to settle.'}`;
};

export const ExitBanner = ({ view }: { view: Pick<LeaveView, 'exit'> }) => (view.exit ? <Alert type="warning" showIcon data-exit message={settlementText(view)} /> : null);
