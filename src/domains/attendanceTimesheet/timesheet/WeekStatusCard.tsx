// PROTOTYPE-SETUP: ESS Service 1 (V2) — the Timesheet tab's week status card for the week in focus: the status
// chip, one status line and the right action, as in the prototype.
//   Draft ............. "Auto-submits to {manager} on {date}."
//   Submitted ......... "Sent to {manager} on {date}. You can keep editing until it's approved."
//   Sent back ......... "{manager} asked for an update: {comment}" + Resubmit
//   Approved .......... "Approved by {manager}. You can still request a change." + Request a change
//   Change pending .... "Change waiting for {manager}. Reason: …" + Show my changes / Withdraw
//   Editing a change .. "Editing a copy. …" + Send change / Discard
//   Approval off / payroll processed: an explanation, no action.
import { Button, Popconfirm, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';

import { WEEKDAYS, addDays } from '@src/prototype/rules/attendance';

import type { TimesheetWeekView } from '../types';

export type WeekChipKey = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'SENT_BACK' | 'CHANGE';

/** Prototype chip labels (employee view). */
const CHIP: Record<WeekChipKey, { label: string; color: string }> = {
    DRAFT: { label: 'Draft', color: 'default' },
    SUBMITTED: { label: 'Awaiting manager', color: 'blue' },
    APPROVED: { label: 'Approved', color: 'green' },
    SENT_BACK: { label: 'Sent back', color: 'red' },
    CHANGE: { label: 'Change pending', color: 'orange' },
};

export const weekChipKey = (view: TimesheetWeekView): WeekChipKey =>
    view.changeRequest?.status === 'PENDING' ? 'CHANGE' : view.week.status;

export const WeekChip = ({ view }: { view: TimesheetWeekView }) => {
    if (!view.approvalEnabled) return <Tag className="!m-0">No approval needed</Tag>;
    const chip = CHIP[weekChipKey(view)];
    return (
        <Tag color={chip.color} className="!m-0">
            {chip.label}
        </Tag>
    );
};

export interface WeekStatusCardProps {
    view: TimesheetWeekView | null;
    today: string;
    busy?: boolean;
    /** Editing a change request: number of changes so far (null = not editing). */
    editingChanges: number | null;
    showProposed: boolean;
    onResubmit: () => void;
    onRequestChange: () => void;
    onToggleProposed: () => void;
    onWithdraw: () => void;
    onSendChange: () => void;
    onDiscard: () => void;
}

const shortDate = (iso: string) => dayjs(iso).format('D MMM');

const WeekStatusCard = ({
    view,
    today,
    busy,
    editingChanges,
    showProposed,
    onResubmit,
    onRequestChange,
    onToggleProposed,
    onWithdraw,
    onSendChange,
    onDiscard,
}: WeekStatusCardProps) => {
    if (!view) {
        return (
            <section aria-label="Week status" className="rounded-xl border border-solid border-gray-200 bg-white p-4">
                <Skeleton active title={false} paragraph={{ rows: 3 }} />
            </section>
        );
    }
    const { week } = view;
    const mgr = view.employee.managerName ?? 'your manager';
    const pending = view.changeRequest?.status === 'PENDING' ? view.changeRequest : null;
    let line: string;
    let actions: React.ReactNode = null;

    if (!view.approvalEnabled) {
        line = `Approval is off. ${view.employee.managerName ?? 'Your manager'} can see your timesheet, and you can edit it until payroll is processed.`;
    } else if (view.editMode === 'locked') {
        line = 'Payroll is processed for this period, so it can’t be changed.';
    } else if (editingChanges !== null) {
        line = `Editing a copy. The approved week stays until ${mgr} approves your change. ${editingChanges} change${editingChanges === 1 ? '' : 's'} so far.`;
        actions = (
            <>
                <Button size="small" type="primary" disabled={!editingChanges} onClick={onSendChange}>
                    Send change
                </Button>
                <Button size="small" onClick={onDiscard}>
                    Discard
                </Button>
            </>
        );
    } else if (pending) {
        line = `Change waiting for ${mgr}. Reason: ${pending.reason}`;
        actions = (
            <>
                <Button size="small" onClick={onToggleProposed}>
                    {showProposed ? 'Show approved' : 'Show my changes'}
                </Button>
                <Popconfirm
                    title="Withdraw your change request?"
                    description="The approved week stays as it is."
                    okText="Withdraw"
                    onConfirm={onWithdraw}
                >
                    <Button size="small" type="text" loading={busy}>
                        Withdraw
                    </Button>
                </Popconfirm>
            </>
        );
    } else if (week.status === 'APPROVED') {
        line = `Approved by ${week.decision?.by.name ?? mgr}. You can still request a change.`;
        actions = (
            <Button size="small" onClick={onRequestChange}>
                Request a change
            </Button>
        );
    } else if (week.status === 'SENT_BACK') {
        line = `${week.decision?.by.name ?? mgr} asked for an update: ${week.decision?.comment ?? ''}`;
        actions = (
            <Button size="small" type="primary" loading={busy} disabled={!view.canSubmit} onClick={onResubmit}>
                Resubmit
            </Button>
        );
    } else if (week.status === 'SUBMITTED') {
        line = `Sent to ${mgr}${week.submittedAt ? ` on ${shortDate(week.submittedAt)}` : ''}. You can keep editing until it’s approved.`;
    } else {
        const submitOn = addDays(week.weekStart, WEEKDAYS.indexOf(view.submissionWeekday));
        line =
            submitOn >= today
                ? `Auto-submits to ${mgr} on ${dayjs(submitOn).format('ddd, D MMM')}.`
                : 'Goes out on the next submission run.';
    }

    return (
        <section aria-label="Week status" className="rounded-xl border border-solid border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2">
                <h3 className="m-0 text-base font-medium text-gray-900">Week of {dayjs(week.weekStart).format('D MMM')}</h3>
                <span className="flex-1" />
                <WeekChip view={view} />
            </div>
            <p className="my-2 break-words text-[13px] text-gray-600">{line}</p>
            {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
        </section>
    );
};

export default WeekStatusCard;
