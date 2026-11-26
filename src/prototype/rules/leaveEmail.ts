// PROTOTYPE-SETUP (Leave email notifications — notes guide.shared → "Email notifications for leave applications"): when
// a leave-type request reaches an approval level, the approver(s) at that level get one email. These rules decide, from
// the request's approval trail alone, whether an email is due, for which step, with which trigger, and the key that
// makes it go out once (per request, per round, per step).
//   due ......... the trail is waiting at a step (the first undecided, non-skipped one); approved straight away (HR's
//                 Add leave), rejected, sent back, cancelled or withdrawn → nothing
//   trigger ..... submitted (no earlier step approved in this round, first round) · next_level (an earlier step in this
//                 round approved) · resubmitted (a later round: the employee updated or edited it and it starts again)
//   round ....... how many times it was resubmitted ("Updated and resubmitted" / "Edited and resubmitted" in the history)
//   key ......... request kind + id + round + step index, so re-renders, retries and unrelated saves don't send twice
import type { ApprovalStep, ApprovalTrail } from '@src/domains/attendanceTimesheet/types';

import type { LeaveEmailTrigger } from './leaveEmailTemplates';

export type LeaveEmailKind = 'leave' | 'cancel' | 'change' | 'compoff';

export const REQUEST_TYPE_LABEL: Record<LeaveEmailKind, string> = {
    leave: 'Leave request',
    cancel: 'Leave cancellation',
    change: 'Leave change',
    compoff: 'Comp off request',
};

/** How many times the request went back to Level 1 after being resubmitted or edited. */
export const emailRound = (trail: Pick<ApprovalTrail, 'history'>) =>
    (trail.history ?? []).filter(h => h.action === 'Updated and resubmitted' || h.action === 'Edited and resubmitted').length;

/** "Level 1" · "Endorsement" · "Level 2". */
export const levelLabel = (step: Pick<ApprovalStep, 'level' | 'endorsement'>) => {
    if (step.endorsement) return 'Endorsement';
    return `Level ${step.level}`;
};

export interface LeaveEmailDue {
    stepIndex: number;
    step: ApprovalStep;
    trigger: LeaveEmailTrigger;
    round: number;
}

/** The email due for a trail right now, or null (not waiting for anyone). */
export const leaveEmailDue = (trail: ApprovalTrail, withdrawn = false): LeaveEmailDue | null => {
    if (withdrawn || !trail.status.startsWith('PENDING')) return null;
    const stepIndex = trail.steps.findIndex(s => !s.decision && !s.skipped);
    if (stepIndex < 0) return null;
    const round = emailRound(trail);
    const movedOn = trail.steps.slice(0, stepIndex).some(s => s.decision === 'APPROVED');
    let trigger: LeaveEmailTrigger = 'submitted';
    if (movedOn) trigger = 'next_level';
    else if (round > 0) trigger = 'resubmitted';
    return { stepIndex, step: trail.steps[stepIndex], trigger, round };
};

/** Send once: one key per request, round and step. */
export const leaveEmailKey = (kind: LeaveEmailKind, id: string, due: Pick<LeaveEmailDue, 'round' | 'stepIndex'>) => `${kind}:${id}:r${due.round}:s${due.stepIndex}`;

/**
 * The items of a collection whose trail changed in a write (new items included): only those can need an email, so
 * seeded data and unrelated saves never send anything.
 */
export const changedTrails = <T extends { id: string; trail: ApprovalTrail }>(prev: T[], next: T[]) => {
    const before = new Map(prev.map(x => [x.id, x.trail]));
    return next.filter(x => before.get(x.id) !== x.trail);
};
