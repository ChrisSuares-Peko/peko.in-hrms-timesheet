// PROTOTYPE-SETUP (Overview, Slice 2; decluttered in Overview v2, Slice 2; ESS design, Slice 2): section 3 —
// "Timesheet" with "Full timesheet".
// "Today: 1h 30m of 8h", the day bar (the Timesheet tab's component), the last 2 entries ("and N
// more"), and "+ Add entry", which opens the entry form (same rules as the Timesheet tab, no hint) in a small modal
// (Overview v5, Slice 1) that closes after a successful add or on Cancel — the card never changes height. The week's status is a small chip ("Week: Draft ·
// auto-submits Fri 16 Oct"). When today can't be edited, a one-line message replaces the button.
// PROTOTYPE-SETUP (Timesheet filing): the chip names the filing period ("Day" / "Week" / "Month") and its automatic
// submission date; the form and the entry lines follow the company's fields (no times in duration-only filing).
// PROTOTYPE-SETUP (Final batch, Slice 3): Submit for the period, with the status line, the auto-save note and the same
// checks as the Timesheet tab (missing details, overlaps, gaps, then checked-in hours not logged — "Submit for
// approval?"); "Review entries" opens the full timesheet on that day.
import { useMemo, useRef, useState } from 'react';


import { PlusOutlined } from '@ant-design/icons';
import { Button, Modal, Tag, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';
import { useAppDispatch } from '@src/hooks/store';
import { entryMins, entryTimeText, formatDuration, isTimed, locationChip, usesTimes } from '@src/prototype/rules/attendance';
import { PERIOD_NOUN, SubmissionAcknowledgement, SubmissionPrompt, periodKind, reviewPeriod, submissionPrompt } from '@src/prototype/rules/timesheetFiling';
import { showToast } from '@src/slices/apiSlice';

import { addEntry, submitWeek } from '../api';
import { WEEK_STATUS } from '../components/format';
import { useAtsScope } from '../hooks/useAtsScope';
import { BarTrack } from '../timesheet/DayRows';
import EntryForm, { EntryFormValue } from '../timesheet/EntryForm';
import SubmitReviewModal from '../timesheet/SubmitReviewModal';
import { statusLine, submitNote } from '../timesheet/WeekStatusCard';
import type { AtsMode, TimesheetWeekView } from '../types';

const { Text } = Typography;

const SHOWN_ENTRIES = 2;

/** The period chip: "Week: Draft · auto-submits Fri 16 Oct" / "Month: Submitted" / "Day: Change pending" / … */
export const weekChip = (week: TimesheetWeekView): { text: string; color?: string; className?: string } => {
    const { period, frequency } = week.filing;
    const noun = PERIOD_NOUN[periodKind(period.start, period.end, frequency)];
    const name = noun.charAt(0).toUpperCase() + noun.slice(1);
    if (!week.approvalEnabled) return { text: `${name}: recorded (no approval)` };
    const { status } = week.week;
    if (status === 'DRAFT') {
        const on = week.filing.autoSubmitOn;
        return { text: `${name}: Draft${on ? ` · auto-submits ${dayjs(on).format('ddd D MMM')}` : ''}` };
    }
    return { text: `${name}: ${WEEK_STATUS[status].label}`, color: WEEK_STATUS[status].color };
};

const OvTimesheetCard = ({
    week,
    mode,
    today,
    onWeek,
    fullPath,
    className,
}: {
    week: TimesheetWeekView;
    mode: AtsMode;
    today: string;
    /** An entry was added: the fresh week. */
    onWeek: (next: TimesheetWeekView) => void;
    /** The Timesheet tab, opened on today. */
    fullPath: string;
    className?: string;
}) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState(false);
    const [prompt, setPrompt] = useState<{ kind: Exclude<SubmissionPrompt, null>; ack: SubmissionAcknowledgement } | null>(null);
    const submitting = useRef(false);
    const navigate = useNavigate();
    const review = useMemo(() => reviewPeriod({ days: week.days, fields: week.filing.fields, mode: week.mode, today }), [week, today]);
    const day = week.days.find(d => d.date === today);
    if (!day) return null;

    const open = week.week.status === 'DRAFT' || week.week.status === 'SENT_BACK';
    const canSubmit = week.approvalEnabled && week.editMode !== 'locked' && week.filing.period.start <= today;

    const send = async (ack: SubmissionAcknowledgement) => {
        if (submitting.current) return;
        submitting.current = true;
        setPrompt(null);
        setBusy(true);
        const res = await submitWeek(scope, week.week.weekStart, ack);
        setBusy(false);
        submitting.current = false;
        if (!res) return;
        onWeek(res);
        dispatch(showToast({ description: `Sent to ${week.employee.managerName ?? 'Payroll'} for approval`, variant: 'success' }));
    };
    const advance = (ack: SubmissionAcknowledgement) => {
        const kind = submissionPrompt(review, 'manual', ack);
        if (kind) setPrompt({ kind, ack });
        else send(ack);
    };
    /** "Review entries": the full timesheet on that day. */
    const reviewDay = (date: string) => {
        setPrompt(null);
        navigate(`${fullPath.split('?')[0]}?date=${date}`);
    };

    const editable = week.editMode === 'direct' && !day.locked;
    const shown = day.entries.slice(-SHOWN_ENTRIES);
    const more = day.entries.length - shown.length;
    const chip = weekChip(week);
    const { fields } = week.filing;
    const times = usesTimes(fields);

    const save = async (value: EntryFormValue) => {
        setBusy(true);
        const res = await addEntry(scope, value);
        setBusy(false);
        if (!res) return false;
        onWeek(res);
        setAdding(false);
        dispatch(showToast({ description: 'Entry added.', variant: 'success' }));
        return true;
    };

    let addArea = (
        <Button icon={<PlusOutlined />} className="self-start" onClick={() => setAdding(true)}>
            Add entry
        </Button>
    );
    if (!editable) addArea = <Text className="text-xs text-[#9e9e9e]">Today can’t be edited right now. Open the full timesheet for details.</Text>;

    return (
        // PROTOTYPE-SETUP (Overview v5, Slice 1): the parts keep the card's normal gaps (no spreading to fill the row).
        <EssCard
            label="Today's timesheet"
            heading={<EssSectionHeading title="Timesheet" link={{ to: fullPath, text: 'Full timesheet' }} />}
            className={className}
        >
            <div>
                <Text className="block text-base text-[#080808]">
                    <span className="text-[#616161]">Today:</span> <span className="font-medium">{formatDuration(day.loggedMinutes)}</span>
                    {day.expectedMinutes ? <span className="text-[#616161]"> of {formatDuration(day.expectedMinutes)}</span> : null}
                </Text>
                <div className="mt-3">
                    {/* PROTOTYPE-SETUP (Final batch, Slice 4): the bar only (no thin meter under it). */}
                    <BarTrack day={day} mode={mode} />
                </div>
            </div>
            {shown.length ? (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {shown.map(e => (
                        <li key={e.id} className={`grid ${times ? 'grid-cols-[136px_52px_minmax(0,1fr)]' : 'grid-cols-[52px_minmax(0,1fr)]'} items-baseline gap-2 text-sm`}>
                            {times && (
                                <span className={`tabular-nums ${isTimed(e) ? 'text-[#080808]' : 'italic text-[#9e9e9e]'}`}>
                                    {entryTimeText(e)}
                                </span>
                            )}
                            <span className="tabular-nums text-[#616161]">{formatDuration(entryMins(e))}</span>
                            <span className="truncate text-[#080808]" title={`${locationChip(e.location, e.client)} · ${e.description}`}>
                                <span className="text-[#9e9e9e]" data-location-chip>
                                    {locationChip(e.location, e.client)} ·{' '}
                                </span>
                                {e.description}
                            </span>
                        </li>
                    ))}
                    {more > 0 && <li className="text-xs text-[#9e9e9e]">and {more} more</li>}
                </ul>
            ) : (
                <Text className="text-sm text-[#9e9e9e]">Nothing logged today yet.</Text>
            )}
            <div className="flex flex-wrap items-center gap-2">
                {addArea}
                {canSubmit && (
                    <Tooltip title={open ? undefined : 'Already sent for approval'}>
                        <Button type="primary" disabled={!open || !week.canSubmit || busy} loading={busy && !adding} onClick={() => advance({})} data-ov-submit>
                            Submit
                        </Button>
                    </Tooltip>
                )}
            </div>
            <div className="flex flex-col gap-1">
                <Tag color={chip.color} bordered={false} className={`!m-0 self-start px-3 py-0.5 text-xs ${chip.className ?? ''}`}>
                    {chip.text}
                </Tag>
                <Text className="text-xs text-[#616161]" data-ov-status-line>
                    {statusLine(week, today)}
                </Text>
                {canSubmit && <Text className="text-[11px] leading-4 text-[#9e9e9e]">{submitNote(!open)}</Text>}
            </div>
            <SubmitReviewModal
                kind={prompt?.kind ?? null}
                review={review}
                entries={week.week.entries}
                busy={busy}
                managerName={week.employee.managerName}
                periodWord={PERIOD_NOUN[periodKind(week.filing.period.start, week.filing.period.end, week.filing.frequency)]}
                onReview={reviewDay}
                onContinue={() => prompt && advance({ ...prompt.ack, [prompt.kind]: true })}
                onClose={() => setPrompt(null)}
            />
            <Modal
                open={adding && editable}
                title={`Add entry · Today, ${dayjs(today).format('ddd D MMM')}`}
                footer={null}
                width={520}
                centered
                destroyOnHidden
                onCancel={() => setAdding(false)}
            >
                <div className="pt-2">
                    <EntryForm
                        date={today}
                        others={day.entries}
                        fields={fields}
                        projectCodes={week.filing.projectCodes}
                        quick
                        compact
                        hideHint
                        multilineDescription
                        busy={busy}
                        onSave={save}
                        onCancel={() => setAdding(false)}
                    />
                </div>
            </Modal>
        </EssCard>
    );
};

export default OvTimesheetCard;
