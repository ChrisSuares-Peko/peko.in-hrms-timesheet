// PROTOTYPE-SETUP (Final batch, Slice 5): the Leave page's late check-in deductions and the Loss of pay card.
//   panel ...... "Late check-in deductions", the rule in one line, then one row per late check-in this leave year:
//                "Fri 23 Oct · late by 25m" | "−0.5 · Annual" (" · correction pending"); a reversed one reads
//                "Fri 23 Oct · correction approved 24 Oct" | "+0.5 · reversed" (green)
//   card ....... "Loss of pay" / "1 day" / "From late check-ins with no leave left" (only when there is some)
import { Typography } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { formatDuration } from '@src/prototype/rules/attendance';
import { dayWord, fmtDays, lateDeductionIntro, lateLedgerText } from '@src/prototype/rules/leavePolicy';

import type { LeaveView } from '../types';

const { Text } = Typography;

export const LateDeductionsPanel = ({ view }: { view: LeaveView }) => {
    const off = !view.lateDeductionDays;
    return (
        <section aria-label="Late check-in deductions" className={ESS_CARD} data-late-panel>
            <h3 className="m-0 text-base font-medium text-gray-900">Late check-in deductions</h3>
            <Text type="secondary" className="mt-1 block text-xs">
                {off ? 'Late check-ins don’t deduct leave at your company.' : lateDeductionIntro(view.lateDeductionDays)}
            </Text>
            {!off && view.lateDeductions.length === 0 && <Text className="mt-3 block text-sm text-gray-500">No late check-ins this leave year.</Text>}
            {view.lateDeductions.length > 0 && (
                <ul className="m-0 mt-2 list-none p-0">
                    {view.lateDeductions.map(d => (
                        <li key={d.date} className="flex flex-wrap items-baseline justify-between gap-x-3 border-0 border-b border-solid border-gray-100 py-2 text-sm last:border-b-0">
                            <span className="text-gray-800">
                                {dayjs(d.date).format('ddd D MMM')} ·{' '}
                                {d.state === 'reversed' && d.reversedOn ? `correction approved ${dayjs(d.reversedOn).format('D MMM')}` : `late by ${formatDuration(d.lateMinutes)}`}
                            </span>
                            <span className={`tabular-nums ${d.state === 'reversed' ? 'text-[#067647]' : 'text-gray-700'}`}>{lateLedgerText(d)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export const LossOfPayCard = ({ days }: { days: number }) =>
    days > 0 ? (
        <section aria-label="Loss of pay" className="rounded-2xl border border-solid border-[#FECDCA] bg-[#FEF3F2] p-4" data-lop-card>
            <Text className="block text-sm text-[#B42318]">Loss of pay</Text>
            <Text className="block text-2xl font-semibold text-[#B42318]">
                {fmtDays(days)} {dayWord(days)}
            </Text>
            <Text className="block text-xs text-[#B42318]">From late check-ins with no leave left</Text>
        </section>
    ) : null;
