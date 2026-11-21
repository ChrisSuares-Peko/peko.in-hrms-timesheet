// PROTOTYPE-SETUP (Leave module): Attendance → "Notes" — the latest 5 late check-in deductions and their dispute:
//   no dispute yet .... "Late on Tue 13 Oct by 25m. Half a day of Annual leave was deducted. If you weren’t late, raise
//                       a dispute." · Raise dispute
//   pending ........... "Dispute for Tue 13 Oct is waiting for Arjun Mehta. …It’s given back automatically if the
//                       dispute is approved."
//   update requested .. "…is waiting for your update." (the request is in My correction requests)
//   rejected .......... "Your dispute for Tue 13 Oct was rejected by Arjun Mehta. “comment” Half a day … stays
//                       deducted." · Dispute again
//   reversed .......... "Dispute for Tue 13 Oct approved: +0.5 reversed." (green)
// A dispute is an attendance correction for that day; approving it reverses the deduction automatically.
import { useEffect, useState } from 'react';

import { Button, Typography } from 'antd';

import { formatDuration } from '@src/prototype/rules/attendance';
import { fmtDays, lateAmountText } from '@src/prototype/rules/leave';

import { getLeaveView } from '../api';
import { Panel } from './ui';
import { useAtsScope } from '../hooks/useAtsScope';
import { fmtDay } from '../leave/leaveUi';
import type { LateDeduction } from '../types';

const { Text } = Typography;

const LateNotesPanel = ({ reloadKey, onDispute }: { reloadKey: number; onDispute: (date: string) => void }) => {
    const scope = useAtsScope();
    const [notes, setNotes] = useState<LateDeduction[] | null>(null);
    useEffect(() => {
        let live = true;
        getLeaveView(scope).then(res => {
            if (live && res) setNotes(res.lateDeductions.slice(0, 5));
        });
        return () => {
            live = false;
        };
    }, [scope, reloadKey]);
    if (!notes?.length) return null;
    return (
        <Panel title="Notes" subtitle="Late check-ins and their leave deductions">
            <ul className="m-0 flex list-none flex-col gap-2 p-0" data-late-notes>
                {notes.map(d => {
                    const amount = lateAmountText(d);
                    const late = formatDuration(d.lateMinutes);
                    let tone = 'bg-[#FAFAFA]';
                    let body: React.ReactNode;
                    let action: React.ReactNode = null;
                    if (d.state === 'reversed') {
                        tone = 'bg-[#ECFDF3]';
                        body = (
                            <>
                                <b className="font-medium">Dispute for {fmtDay(d.date)} approved.</b> +{fmtDays(d.days)} reversed, given back to your balance.
                            </>
                        );
                    } else if (d.dispute?.state === 'pending') {
                        tone = 'bg-[#E6F4FF]';
                        body = (
                            <>
                                <b className="font-medium">
                                    Dispute for {fmtDay(d.date)} is waiting for {d.dispute.with}.
                                </b>{' '}
                                {amount} was deducted for checking in {late} late. It’s given back automatically if the dispute is approved.
                            </>
                        );
                    } else if (d.dispute?.state === 'update_requested') {
                        tone = 'bg-[#FFF6EA]';
                        body = (
                            <>
                                <b className="font-medium">Dispute for {fmtDay(d.date)} is waiting for your update.</b> {d.dispute.by ? `${d.dispute.by}: “${d.dispute.comment}”. ` : ''}
                                Update it under My correction requests.
                            </>
                        );
                    } else if (d.dispute?.state === 'rejected') {
                        tone = 'bg-[#FFF1F0]';
                        body = (
                            <>
                                <b className="font-medium">
                                    Your dispute for {fmtDay(d.date)} was rejected{d.dispute.by ? ` by ${d.dispute.by}` : ''}.
                                </b>
                                {d.dispute.comment ? ` “${d.dispute.comment}”` : ''} {amount} stays deducted.
                            </>
                        );
                        action = (
                            <Button size="small" onClick={() => onDispute(d.date)} data-dispute-again>
                                Dispute again
                            </Button>
                        );
                    } else {
                        body = (
                            <>
                                <b className="font-medium">
                                    Late on {fmtDay(d.date)} by {late}.
                                </b>{' '}
                                {amount} was deducted. If you weren’t late, raise a dispute.
                            </>
                        );
                        action = (
                            <Button size="small" onClick={() => onDispute(d.date)} data-raise-dispute>
                                Raise dispute
                            </Button>
                        );
                    }
                    return (
                        <li key={d.date} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-4 py-3 ${tone}`} data-late-note={d.dispute?.state ?? d.state}>
                            <Text className="min-w-0 flex-1 basis-[260px] text-sm">{body}</Text>
                            {action}
                        </li>
                    );
                })}
            </ul>
        </Panel>
    );
};

export default LateNotesPanel;
