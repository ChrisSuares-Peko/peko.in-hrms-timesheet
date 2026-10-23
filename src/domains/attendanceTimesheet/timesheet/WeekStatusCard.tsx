// PROTOTYPE-SETUP: ESS Service 1 (V2) — the Timesheet tab's status card for the period in focus: the status chip,
// one status line and the right action, as in the prototype.
// PROTOTYPE-SETUP (Timesheet filing): the card is the filing period's — a day, a week or a month, per the company's
// frequency — with ‹ › to the previous / next period, a summary (logged time, entries) and the period's warnings
// (overlaps, gaps over 5 minutes, entries missing details; click to review them).
// PROTOTYPE-SETUP (Final batch, Slices 1 and 3): every change saves straight away; the one button is Submit. Lines:
//   Draft ............ "Draft. Changes save automatically. Auto-submits {Friday} at {11:00 PM}."
//   Edited ........... "Edited after it was sent. Submit again to get it re-approved. Changes save automatically. …"
//   With manager ..... "With {manager} since {23 Oct}. You can still edit it, but it goes back to draft and needs submitting again."
//   With Payroll ..... "Approved by {manager}, now with Payroll. Editing moves it back to draft."
//   Approved ......... "Approved. You can still edit it until payroll is processed; edits need submitting again."
//   Update requested . "{manager} asked for an update: {comment} Update it, then submit again." (My team, Slice 1)
//   Approval off / payroll processed: an explanation, no action.
import { LeftOutlined, RightOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Skeleton, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { displayTime, formatDuration } from '@src/prototype/rules/attendance';
import { FREQUENCY_LABEL, PeriodReview, gapCount, periodKind } from '@src/prototype/rules/timesheetFiling';

import { WEEK_STATUS } from '../components/format';
import type { TimesheetWeekView } from '../types';

export const WeekChip = ({ view }: { view: TimesheetWeekView }) => {
    if (!view.approvalEnabled) return <Tag className="!m-0">No approval needed</Tag>;
    const chip = WEEK_STATUS[view.week.status];
    return (
        <Tag color={chip.color} className="!m-0">
            {chip.label}
        </Tag>
    );
};

/** "Every change saves automatically. …" / "Sent for approval. …" — under the Submit button. */
export const submitNote = (sent: boolean) =>
    sent
        ? 'Sent for approval. Editing an entry moves it back to draft.'
        : 'Every change saves automatically. It’s only sent for approval when you submit, or at auto-submit.';

/** The status line for the period, per the prototype. */
export const statusLine = (view: TimesheetWeekView, today: string) => {
    const { week, filing } = view;
    const mgr = view.employee.managerName ?? 'HR';
    if (!view.approvalEnabled) return `Approval is off. ${view.employee.managerName ?? 'Your manager'} can see your timesheet, and you can edit it until payroll is processed.`;
    if (view.editMode === 'locked') return 'Payroll is processed for this period, so it can’t be changed.';
    const auto = filing.autoSubmitOn
        ? ` Auto-submits ${filing.frequency === 'WEEKLY' ? dayjs(filing.autoSubmitOn).format('dddd') : dayjs(filing.autoSubmitOn).format('ddd, D MMM')} at ${displayTime(filing.autoSubmitAt)}.`
        : '';
    switch (week.status) {
        case 'SENT_BACK': {
            const by = week.sentBackBy === 'PAYROLL' ? 'Payroll' : week.decision?.by.name ?? mgr;
            return `${by} asked for an update: ${week.decision?.comment ?? ''} Update it, then submit again.`;
        }
        case 'SUBMITTED': {
            const since = week.submittedAt ? ` since ${dayjs(week.submittedAt).format('D MMM')}` : '';
            return `With ${mgr}${since}. You can still edit it, but it goes back to draft and needs submitting again.`;
        }
        case 'WITH_PAYROLL':
            return `Approved by ${week.managerDecision?.by.name ?? mgr}, now with Payroll. Editing moves it back to draft.`;
        case 'APPROVED':
            return 'Approved. You can still edit it until payroll is processed; edits need submitting again.';
        default:
            if (filing.period.start > today) return `This period starts on ${dayjs(filing.period.start).format('ddd, D MMM')}. You can log planned work now and submit it once it has started.`;
            return week.baselineEntries && week.editedAfter
                ? `Edited after it was sent. Submit again to get it re-approved. Changes save automatically.${auto}`
                : `Draft. Changes save automatically.${auto}`;
    }
};

export interface WeekStatusCardProps {
    view: TimesheetWeekView | null;
    today: string;
    busy?: boolean;
    /** PROTOTYPE-SETUP (Timesheet filing): the period's checks. */
    review?: PeriodReview | null;
    /** Submit a draft, or resubmit a sent-back period (runs the checks first). */
    onSubmit: () => void;
    /** Previous / next filing period. */
    onStepPeriod?: (dir: 1 | -1) => void;
    /** Show the warnings (overlaps, gaps, missing details) with the entries they concern. */
    onReview?: () => void;
    /** PROTOTYPE-SETUP (HR rules, Slice 3): no card of its own (inside the Notices panel). */
    bare?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const WeekStatusCard = ({ view, today, busy, review, onSubmit, onStepPeriod, onReview, bare = false }: WeekStatusCardProps) => {
    const shell = bare ? '' : ESS_CARD;
    if (!view) {
        return (
            <section aria-label="Filing period" className={shell}>
                <Skeleton active title={false} paragraph={{ rows: 3 }} />
            </section>
        );
    }
    const { week, filing } = view;
    const open = week.status === 'DRAFT' || week.status === 'SENT_BACK';
    const showSubmit = view.approvalEnabled && view.editMode !== 'locked' && filing.period.start <= today;
    const entries = week.entries.length;
    const checks = review && open ? review : null;
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
            <p className="my-2 break-words text-[13px] text-gray-600" data-status-line>
                {statusLine(view, today)}
            </p>
            {showSubmit && (
                <div className="flex flex-col items-start gap-1.5">
                    <Tooltip title={open ? undefined : 'Already sent for approval'}>
                        <Button size="small" type="primary" loading={busy} disabled={!open || !view.canSubmit || busy} onClick={onSubmit} data-submit-period>
                            Submit
                        </Button>
                    </Tooltip>
                    <span className="text-[11px] leading-4 text-gray-500" data-submit-note>
                        {submitNote(!open)}
                    </span>
                </div>
            )}
        </section>
    );
};

export default WeekStatusCard;
