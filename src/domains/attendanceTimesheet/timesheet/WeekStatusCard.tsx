// PROTOTYPE-SETUP: ESS Service 1 (V2) — the Timesheet tab's status card for the period in focus: the status chip,
// one status line and the right action, as in the prototype.
// PROTOTYPE-SETUP (Timesheet filing): the card is the filing period's — a day, a week or a month, per the company's
// frequency — with ‹ › to the previous / next period, a summary (logged time, entries) and the period's warnings
// (overlaps, gaps over 5 minutes, entries missing details; click to review them). Lines and actions:
//   Draft ............. "Goes to {manager} automatically on {date}, or submit it now." + Submit
//   Submitted ......... "Sent to {manager} on {date}. You can keep editing until it's approved."
//   Sent back ......... "{manager} asked for an update: {comment}" + Resubmit
//   Approved .......... "Approved by {manager}. You can still request a change." + Request a change
//   Change pending .... "Change waiting for {manager}. Reason: …" + Show my changes / Withdraw
//   Editing a change .. "Editing a copy. …" + Send change / Discard
//   Approval off / payroll processed: an explanation, no action.
import { LeftOutlined, RightOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { formatDuration } from '@src/prototype/rules/attendance';
import { FREQUENCY_LABEL, PeriodReview, gapCount, periodKind } from '@src/prototype/rules/timesheetFiling';

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
    /** PROTOTYPE-SETUP (Timesheet filing): the period's checks (null while editing a change or loading). */
    review?: PeriodReview | null;
    /** Submit a draft, or resubmit a sent-back period (runs the checks first). */
    onSubmit: () => void;
    onRequestChange: () => void;
    onToggleProposed: () => void;
    onWithdraw: () => void;
    onSendChange: () => void;
    onDiscard: () => void;
    /** Previous / next filing period. */
    onStepPeriod?: (dir: 1 | -1) => void;
    /** Show the warnings (overlaps, gaps, missing details) with the entries they concern. */
    onReview?: () => void;
    /** PROTOTYPE-SETUP (HR rules, Slice 3): no card of its own (inside the Notices panel). */
    bare?: boolean;
}

const shortDate = (iso: string) => dayjs(iso).format('D MMM');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const WeekStatusCard = ({
    view,
    today,
    busy,
    editingChanges,
    showProposed,
    review,
    onSubmit,
    onRequestChange,
    onToggleProposed,
    onWithdraw,
    onSendChange,
    onDiscard,
    onStepPeriod,
    onReview,
    bare = false,
}: WeekStatusCardProps) => {
    const shell = bare ? '' : ESS_CARD;
    if (!view) {
        return (
            <section aria-label="Filing period" className={shell}>
                <Skeleton active title={false} paragraph={{ rows: 3 }} />
            </section>
        );
    }
    const { week, filing } = view;
    const mgr = view.employee.managerName ?? 'your manager';
    const pending = view.changeRequest?.status === 'PENDING' ? view.changeRequest : null;
    let line: string;
    let actions: React.ReactNode = null;

    if (!view.approvalEnabled) {
        line = `Approval is off. ${view.employee.managerName ?? 'Your manager'} can see your timesheet, and you can edit it until payroll is processed.`;
    } else if (view.editMode === 'locked') {
        line = 'Payroll is processed for this period, so it can’t be changed.';
    } else if (editingChanges !== null) {
        line = `Editing a copy. The approved timesheet stays until ${mgr} approves your change. ${editingChanges} change${editingChanges === 1 ? '' : 's'} so far.`;
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
                    description="The approved timesheet stays as it is."
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
            <Button size="small" type="primary" loading={busy} disabled={!view.canSubmit || busy} onClick={onSubmit}>
                Resubmit
            </Button>
        );
    } else if (week.status === 'SUBMITTED') {
        line = `Sent to ${mgr}${week.submittedAt ? ` on ${shortDate(week.submittedAt)}` : ''}. You can keep editing until it’s approved.`;
    } else if (filing.period.start > today) {
        line = `This period starts on ${dayjs(filing.period.start).format('ddd, D MMM')}. You can log planned work now and submit it once it has started.`;
    } else {
        line = filing.autoSubmitOn
            ? `Goes to ${mgr} automatically on ${dayjs(filing.autoSubmitOn).format('ddd, D MMM')}, or submit it now.`
            : `Submit it to ${mgr} when it’s complete.`;
        actions = (
            <Button size="small" type="primary" loading={busy} disabled={!view.canSubmit || busy} onClick={onSubmit} data-submit-period>
                Submit
            </Button>
        );
    }

    const entries = week.entries.length;
    const checks = review && week.status !== 'APPROVED' && editingChanges === null ? review : null;
    const warnings = checks
        ? [
              checks.issues.length > 0 && `${plural(new Set(checks.issues.map(i => i.entryId)).size, 'entry', 'entries')} missing details`,
              checks.overlaps.length > 0 && plural(checks.overlaps.length, 'overlap'),
              gapCount(checks) > 0 && `${plural(gapCount(checks), 'gap')} over 5 min`,
          ].filter((x): x is string => Boolean(x))
        : [];

    return (
        <section aria-label="Filing period" className={shell} data-filing-period={filing.period.start}>
            <div className="flex items-center gap-1">
                {onStepPeriod && (
                    <Button size="small" type="text" icon={<LeftOutlined />} aria-label="Previous filing period" onClick={() => onStepPeriod(-1)} />
                )}
                <div className="min-w-0">
                    <h3 className={`m-0 truncate font-medium text-gray-900 ${bare ? 'text-sm' : 'text-base'}`}>{filing.period.label}</h3>
                    <span className="block text-[11px] text-[#9e9e9e]">
                        {FREQUENCY_LABEL[periodKind(filing.period.start, filing.period.end, filing.frequency)]} timesheet
                    </span>
                </div>
                {onStepPeriod && (
                    <Button size="small" type="text" icon={<RightOutlined />} aria-label="Next filing period" onClick={() => onStepPeriod(1)} />
                )}
                <span className="flex-1" />
                <WeekChip view={view} />
            </div>
            <p className="m-0 mt-2 text-xs text-gray-500" data-period-summary>
                {formatDuration(view.totals.loggedMinutes)} logged · {plural(entries, 'entry', 'entries')}
            </p>
            {warnings.length > 0 && (
                <button
                    type="button"
                    onClick={onReview}
                    className="mt-1.5 flex w-full cursor-pointer items-start gap-1.5 rounded-lg border-0 bg-[#FFFAEB] px-2 py-1.5 text-left text-xs text-[#93370D] hover:bg-[#FFF3D6]"
                    data-period-warnings
                >
                    <WarningOutlined className="mt-0.5" />
                    <span className="min-w-0 flex-1">{warnings.join(' · ')}</span>
                    <span className="whitespace-nowrap font-medium">Review</span>
                </button>
            )}
            <p className="my-2 break-words text-[13px] text-gray-600">{line}</p>
            {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
        </section>
    );
};

export default WeekStatusCard;
