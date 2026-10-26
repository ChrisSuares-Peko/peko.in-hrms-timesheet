// PROTOTYPE-SETUP (Leave & team, Slice 4): Approve / Ask for update / Reject on a team member's request outside the
// Approvals inbox (Leave to approve, Team reimbursements) — the same confirmation as the inbox (a comment is required
// to reject or ask for an update), then a toast and a reload.
import { useState } from 'react';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { AtsRequestType, decideTeamRequest } from '../api';
import { approvedToast } from '../components/approvalText';
import { PendingDecision, RequestDecision, RequestDecisionModal } from '../components/RequestQueue';
import { useAtsScope } from '../hooks/useAtsScope';
import type { RequestItem } from '../types';

const SINGLE: Partial<Record<string, string>> = { leave: 'leave request', reimbursement: 'reimbursement claim' };

/** PROTOTYPE-SETUP (Payroll admin, Slice 3): the decision call (default: the manager's, level 1). */
export type DecideFn = (item: RequestItem, decision: RequestDecision, comment?: string) => Promise<unknown>;

export const useTeamDecision = (onDone: () => void, decideFn?: DecideFn) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [pending, setPending] = useState<PendingDecision | null>(null);
    const [comment, setComment] = useState('');
    const [commentError, setCommentError] = useState(false);
    const [busy, setBusy] = useState(false);

    const start = (item: RequestItem, decision: RequestDecision) => {
        setPending({ item, decision });
        setComment('');
        setCommentError(false);
    };

    const confirm = async () => {
        if (!pending) return;
        const note = comment.trim();
        if (pending.decision !== 'approve' && !note) {
            setCommentError(true);
            return;
        }
        setBusy(true);
        const res = decideFn
            ? await decideFn(pending.item, pending.decision, note || undefined)
            : await decideTeamRequest(scope, pending.item.type as AtsRequestType, pending.item.id, pending.decision, note || undefined);
        setBusy(false);
        if (!res) return;
        const done = { approve: approvedToast(res as RequestItem, decideFn ? 'Approved. This approval is final.' : 'Request approved'), reject: 'Request rejected', update: `Sent back to ${pending.item.employee.name} to update` };
        dispatch(showToast({ variant: 'success', description: done[pending.decision] }));
        setPending(null);
        onDone();
    };

    const modal = (
        <RequestDecisionModal
            pending={pending}
            busy={busy}
            comment={comment}
            commentError={commentError}
            single={pending ? SINGLE[pending.item.type] ?? 'request' : 'request'}
            onComment={c => {
                setComment(c);
                if (c.trim()) setCommentError(false);
            }}
            onConfirm={confirm}
            onClose={() => setPending(null)}
        />
    );

    return { start, modal };
};
