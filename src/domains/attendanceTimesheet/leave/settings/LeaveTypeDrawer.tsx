// PROTOTYPE-SETUP (Leave module): Leave Policies → Leave types → Add / Edit (a drawer, each field with help text) and
// View (every rule of a type in plain language). A used type keeps its name.
// PROTOTYPE-SETUP (Leave policy settings; notes pay:settings:leave:types): Name · Kind (yearly balance / per event) ·
// Count leave in (working / calendar days). Yearly: days per year, credited; "When an employee joins" (pro-rated,
// during probation); "At the end of the leave cycle" (carry forward up to N / encash / lapse); "When an employee leaves"
// (pro-rated, then encash in F&F and/or bring the last working day forward; stored only). Per event: up to N days or
// weeks per event, the event date label, when it can be taken. "Other": supporting document, applies to, show to
// employees. Changing kind, counting, days, credit, probation, year end, carry forward, applies-to or the event limit
// asks for confirmation with the number of employees affected.
import { useEffect, useState } from 'react';

import { Alert, Button, Checkbox, Drawer, Flex, Input, InputNumber, Modal, Radio, Switch, Typography } from 'antd';

import {
    APPLIES_LABEL,
    COUNT_LABEL,
    CREDIT_LABEL,
    EXIT_OPT_LABEL,
    PROBATION_LABEL,
    accrualText,
    daysText,
    entitlementText,
    exitText,
    fmtDays,
    limitText,
    proofText,
    typeLabel,
    windowText,
    yearEndText,
} from '@src/prototype/rules/leave';

import type { LeaveExitOpt, LeaveTypeConfig, LeaveTypeInput } from '../../types';

const { Text } = Typography;

const SectionHeading = ({ title, note }: { title: string; note: string }) => (
    <div className="border-0 border-t border-solid border-[var(--peko-line)] pt-3" data-lt-section={title}>
        <Text className="block text-base font-medium text-[var(--peko-text)]">{title}</Text>
        <Text type="secondary" className="text-xs">
            {note}
        </Text>
    </div>
);

const Field = ({ label, help, children, htmlFor }: { label: string; help: string; children: React.ReactNode; htmlFor?: string }) => (
    <Flex vertical gap={4}>
        <label htmlFor={htmlFor} className="text-sm text-[var(--peko-text)]">
            {label}
        </label>
        <Text type="secondary" className="text-xs">
            {help}
        </Text>
        {children}
    </Flex>
);

const BLANK: LeaveTypeInput = {
    name: '',
    kind: 'yearly',
    count: 'working',
    daysPerYear: 12,
    credit: 'MONTHLY',
    probation: 'MONTHLY',
    yearEnd: 'lapse',
    carryForward: 0,
    exitOpts: ['prepone'],
    limit: null,
    limitUnit: 'days',
    eventLabel: '',
    windowBefore: null,
    windowAfter: null,
    excess: 'lapse',
    halfDay: true,
    trigger: 'other',
    docRequired: false,
    docName: '',
    proofAfterDays: null,
    appliesTo: 'ALL',
    active: true,
};

/** The fields whose change moves balances or entitlements (asks for confirmation). */
const BALANCE_FIELDS: (keyof LeaveTypeInput)[] = ['kind', 'count', 'daysPerYear', 'credit', 'probation', 'yearEnd', 'carryForward', 'appliesTo', 'limit', 'limitUnit'];

const optional = (n: number | null | undefined) => (n === null || n === undefined ? null : Number(n));

export const LeaveTypeDrawer = ({
    open,
    type,
    used,
    affected,
    onClose,
    onSave,
}: {
    open: boolean;
    /** null = a new type. */
    type: LeaveTypeConfig | null;
    used: boolean;
    /** Employees the type applies to now (for the confirmation). */
    affected: number;
    onClose: () => void;
    onSave: (input: LeaveTypeInput) => Promise<boolean>;
}) => {
    const [v, setV] = useState<LeaveTypeInput>(BLANK);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        setV(type ? { ...type } : BLANK);
        setError('');
        setConfirming(false);
    }, [open, type]);

    const set = <K extends keyof LeaveTypeInput>(k: K, value: LeaveTypeInput[K]) => {
        setV(cur => ({ ...cur, [k]: value }));
        setError('');
        setConfirming(false);
    };
    const changesBalances = Boolean(type) && BALANCE_FIELDS.some(k => JSON.stringify((type as LeaveTypeInput)[k]) !== JSON.stringify(v[k]));
    const event = v.kind === 'event';

    const save = async () => {
        if (!v.name.trim()) return setError('Give the leave type a name.');
        if (!event && !(v.daysPerYear > 0)) return setError('Enter the days per year.');
        if (event && !((v.limit ?? 0) > 0)) return setError('Enter how much can be taken per event.');
        if (changesBalances && !confirming) {
            setConfirming(true);
            return undefined;
        }
        setBusy(true);
        const ok = await onSave({ ...v, name: v.name.trim() });
        setBusy(false);
        if (ok) onClose();
        return undefined;
    };

    const monthly = v.daysPerYear / 12;
    let saveLabel = 'Add leave type';
    if (type) saveLabel = confirming ? 'Confirm and save' : 'Save changes';
    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={type ? `Edit ${type.name}` : 'Add leave type'}
            width={540}
            destroyOnHidden
            styles={{ wrapper: { maxWidth: '100vw' } }}
            footer={
                <Flex vertical gap={8}>
                    {confirming && (
                        <Alert
                            type="warning"
                            showIcon
                            data-confirm-affected
                            message={`This changes ${type?.name} for ${affected} employee${affected === 1 ? '' : 's'} from today. Leave that’s already approved stays as it is.`}
                        />
                    )}
                    {error && <Alert type="error" showIcon message={error} />}
                    <Flex justify="end" gap={8}>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button type="primary" loading={busy} onClick={save} data-save-leave-type>
                            {saveLabel}
                        </Button>
                    </Flex>
                </Flex>
            }
        >
            <Flex vertical gap={18} data-leave-type-drawer>
                <Field label="Name" help="What employees see when they apply, e.g. Annual, Sick, Bereavement leave." htmlFor="lt-name">
                    <Input id="lt-name" value={v.name} disabled={used} placeholder="e.g. Bereavement leave" onChange={e => set('name', e.target.value)} maxLength={40} />
                    {used && (
                        <Text type="secondary" className="text-xs">
                            Already used, so the name can’t change.
                        </Text>
                    )}
                </Field>
                <Field
                    label="Kind"
                    help="Yearly balance: days credited over the leave cycle (annual, casual, sick). Per event: statutory leave taken for an event such as a birth, with no yearly balance."
                >
                    <Radio.Group
                        optionType="button"
                        value={v.kind}
                        onChange={e => set('kind', e.target.value)}
                        aria-label="Kind"
                        data-lt-kind
                        options={[
                            { value: 'yearly', label: 'Yearly balance' },
                            { value: 'event', label: 'Per event' },
                        ]}
                    />
                </Field>
                <Field
                    label="Count leave in"
                    help="Working days skip the employee’s own weekly offs and public holidays. Calendar days count every day in the range, as statutory leave like maternity does."
                >
                    <Radio.Group
                        optionType="button"
                        value={v.count}
                        onChange={e => set('count', e.target.value)}
                        aria-label="Count leave in"
                        data-lt-count
                        options={[
                            { value: 'working', label: 'Working days' },
                            { value: 'calendar', label: 'Calendar days' },
                        ]}
                    />
                </Field>

                {!event && (
                    <>
                        <Field label="Days per year" help="How many days of this leave each employee gets in a full leave cycle. Joiners and leavers get a pro-rated share." htmlFor="lt-days">
                            <Flex align="center" gap={8}>
                                <InputNumber id="lt-days" min={0.5} max={366} step={0.5} value={v.daysPerYear} onChange={n => set('daysPerYear', Number(n ?? 0))} className="!w-[120px]" />
                                <Text type="secondary" className="text-xs">
                                    days ({fmtDays(monthly)} a month)
                                </Text>
                            </Flex>
                        </Field>
                        <Field label="Credited" help="When the days land in the employee’s balance. The day of the month for monthly credits is set in Configuration → Credit date.">
                            <Radio.Group
                                optionType="button"
                                value={v.credit}
                                onChange={e => set('credit', e.target.value)}
                                aria-label="Credited"
                                options={[
                                    { value: 'CYCLE_START', label: 'At the start of the leave cycle' },
                                    { value: 'MONTHLY', label: 'Monthly' },
                                    { value: 'DAILY', label: 'Daily' },
                                ]}
                            />
                            <Text type="secondary" className="text-xs">
                                {v.credit === 'CYCLE_START' && 'The full year’s days are available from day one of the cycle.'}
                                {v.credit === 'MONTHLY' && `${daysText(monthly)} land each month, on the credit date.`}
                                {v.credit === 'DAILY' && `A little is added every day, about ${daysText(monthly)} a month.`}
                            </Text>
                        </Field>
                        <SectionHeading title="When an employee joins" note="Joiners get a pro-rated share for the rest of the leave cycle (a month counts if they join on or before the 15th)." />
                        <Field label="During probation" help="How this leave works while an employee’s status is Probation. It switches to the normal rule when HR marks them Active.">
                            <Radio.Group
                                optionType="button"
                                value={v.probation}
                                onChange={e => set('probation', e.target.value)}
                                aria-label="During probation"
                                options={[
                                    { value: 'MONTHLY', label: 'Credited monthly' },
                                    { value: 'FULL', label: 'Full entitlement' },
                                    { value: 'NONE', label: 'Not available' },
                                ]}
                            />
                        </Field>
                        <SectionHeading
                            title="At the end of the leave cycle"
                            note="For employees still working. It runs automatically on the last working day of the cycle."
                        />
                        <Field label="Unused leave at year end" help="Carry forward moves unused days into the next cycle up to the limit (the rest lapses). Encash pays them out through payroll and the balance restarts. Lapse lets them go.">
                            <Radio.Group value={v.yearEnd} onChange={e => set('yearEnd', e.target.value)} aria-label="Unused leave at year end" className="flex flex-col gap-1.5" data-lt-year-end>
                                <Radio value="carry">
                                    <Flex align="center" gap={8} wrap="wrap">
                                        Carry forward up to
                                        <InputNumber
                                            min={0}
                                            max={366}
                                            size="small"
                                            value={v.carryForward}
                                            disabled={v.yearEnd !== 'carry'}
                                            onChange={n => set('carryForward', Number(n ?? 0))}
                                            className="!w-[80px]"
                                            aria-label="Carry forward up to"
                                            data-lt-carry
                                        />
                                        days, the rest lapses
                                    </Flex>
                                </Radio>
                                <Radio value="encash">Encash (paid out by payroll; the balance restarts)</Radio>
                                <Radio value="lapse">Lapse</Radio>
                            </Radio.Group>
                        </Field>
                        <SectionHeading
                            title="When an employee leaves"
                            note="Leave is pro-rated for the year up to their last working day. What they have left can then be used as ticked below."
                        />
                        <Field
                            label="Unused leave on leaving"
                            help="Tick both to let the employee choose; tick none and it lapses. Full and final settlement is a separate module that comes later; this setting only records the rule."
                        >
                            <Checkbox.Group
                                value={v.exitOpts}
                                onChange={vals => set('exitOpts', vals as LeaveExitOpt[])}
                                aria-label="Unused leave on leaving"
                                className="flex flex-col gap-1.5"
                                options={(['encash', 'prepone'] as const).map(o => ({ value: o, label: EXIT_OPT_LABEL[o] }))}
                            />
                        </Field>
                    </>
                )}

                {event && (
                    <>
                        <SectionHeading title="Per event" note="No yearly balance, accrual, carry forward or leaving rule: each event allows up to the limit." />
                        <Field label="Up to" help="How much can be taken for one event, counted as set above (calendar days for maternity: 26 weeks = 182 days)." htmlFor="lt-limit">
                            <Flex align="center" gap={8}>
                                <InputNumber id="lt-limit" min={1} max={v.limitUnit === 'weeks' ? 52 : 366} value={v.limit ?? undefined} onChange={n => set('limit', optional(n))} className="!w-[100px]" data-lt-limit />
                                <Radio.Group
                                    optionType="button"
                                    value={v.limitUnit}
                                    onChange={e => set('limitUnit', e.target.value)}
                                    aria-label="Limit unit"
                                    options={[
                                        { value: 'days', label: 'Days' },
                                        { value: 'weeks', label: 'Weeks' },
                                    ]}
                                />
                                <Text type="secondary" className="text-xs">
                                    per event
                                </Text>
                            </Flex>
                        </Field>
                        <Field label="Event date asked on the request" help="The date the employee enters when applying, e.g. “Date of birth or adoption”." htmlFor="lt-event">
                            <Input id="lt-event" value={v.eventLabel} placeholder="e.g. Date of birth or adoption" maxLength={60} onChange={e => set('eventLabel', e.target.value)} data-lt-event-label />
                        </Field>
                        <Field label="When it can be taken" help="Leave has to start no earlier than the first number of days before the event, and end within the second number after it. Empty = no limit on that side.">
                            <Flex align="center" gap={8} wrap="wrap">
                                From
                                <InputNumber min={0} max={366} value={v.windowBefore ?? undefined} placeholder="Any" onChange={n => set('windowBefore', optional(n))} className="!w-[80px]" aria-label="Days before the event" data-lt-before />
                                days before to
                                <InputNumber min={0} max={366} value={v.windowAfter ?? undefined} placeholder="Any" onChange={n => set('windowAfter', optional(n))} className="!w-[80px]" aria-label="Days after the event" data-lt-after />
                                days after the event
                            </Flex>
                        </Field>
                    </>
                )}

                <SectionHeading title="Other" note="Documents, who it’s for, and whether employees see it." />
                <Field
                    label="Supporting document needed when longer than"
                    help="If a request is longer than this, the employee has to attach a document (for example a medical certificate) before they can send it."
                    htmlFor="lt-proof"
                >
                    <Flex align="center" gap={8}>
                        <InputNumber
                            id="lt-proof"
                            min={0}
                            max={366}
                            value={v.proofAfterDays ?? undefined}
                            placeholder="Never"
                            onChange={n => set('proofAfterDays', optional(n))}
                            className="!w-[120px]"
                        />
                        <Text type="secondary" className="text-xs">
                            days (empty = never, 0 = always)
                        </Text>
                    </Flex>
                </Field>
                <Field label="Applies to" help="Who can apply for it. Other employees won’t see this type at all.">
                    <Radio.Group
                        optionType="button"
                        value={v.appliesTo}
                        onChange={e => set('appliesTo', e.target.value)}
                        aria-label="Applies to"
                        options={[
                            { value: 'ALL', label: 'All employees' },
                            { value: 'FEMALE', label: 'Female' },
                            { value: 'MALE', label: 'Male' },
                        ]}
                    />
                </Field>
                <Field
                    label="Show to employees"
                    help="Turn off to stop offering this leave type without deleting it. Balances and past leave stay as they are, and HR can still see it."
                >
                    <Flex align="center" gap={8}>
                        <Switch checked={v.active !== false} onChange={c => set('active', c)} aria-label="Show to employees" data-show-to-employees />
                        <Text className="text-sm">{v.active === false ? 'Hidden (deactivated)' : 'Shown'}</Text>
                    </Flex>
                </Field>
                <Text type="secondary" className="text-xs">
                    Every leave type is paid. Loss of pay is the only unpaid leave: employees request it from ESS → Leave → Request LOP.
                </Text>
            </Flex>
        </Drawer>
    );
};

/** Every rule of a type in plain language (the View popup). */
export const leaveTypeRules = (type: LeaveTypeConfig): [string, string][] => {
    const rows: [string, string][] = [
        ['Status', type.active ? 'Active (shown to employees)' : 'Inactive (hidden from employees)'],
        ['Kind', type.kind === 'event' ? 'Per event (no yearly balance)' : 'Yearly balance'],
        ['Entitlement', entitlementText(type)],
        ['Counted in', `${COUNT_LABEL[type.count]}${type.count === 'calendar' ? ' (weekends and public holidays included)' : ' (the employee’s weekly offs and public holidays aren’t counted)'}`],
    ];
    if (type.kind === 'event') {
        rows.push(['Event date asked', type.eventLabel || 'Event date']);
        rows.push(['When it can be taken', windowText(type)]);
        rows.push(['Limit', `Up to ${limitText(type)} for one event, including leave already booked for the same event date`]);
    } else {
        rows.push(['Credited', `${CREDIT_LABEL[type.credit]} · ${accrualText(type)}`]);
        rows.push(['When an employee joins', 'Pro-rated for the rest of the leave cycle (a month counts if they join on or before the 15th)']);
        rows.push(['During probation', PROBATION_LABEL[type.probation]]);
        rows.push(['At the end of the leave cycle', `${yearEndText(type)}${type.yearEnd === 'carry' && type.carryForward > 0 ? '; anything above that lapses' : ''} (runs on the last working day of the cycle)`]);
        rows.push(['When an employee leaves', `Pro-rated to the last working day; then: ${exitText(type)}`]);
    }
    rows.push(['Supporting document', proofText(type)]);
    rows.push(['Applies to', APPLIES_LABEL[type.appliesTo]]);
    return rows;
};

export const LeaveTypeView = ({
    type,
    requests,
    onClose,
    onEdit,
}: {
    type: LeaveTypeConfig | null;
    requests: number;
    onClose: () => void;
    onEdit: () => void;
}) =>
    type ? (
        <Modal
            open
            title={typeLabel(type.name)}
            onCancel={onClose}
            destroyOnHidden
            footer={[
                <Button key="c" onClick={onClose}>
                    Close
                </Button>,
                <Button key="e" type="primary" onClick={onEdit}>
                    Edit
                </Button>,
            ]}
        >
            <dl className="m-0 grid grid-cols-[minmax(0,160px)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm" data-leave-type-view>
                {[...leaveTypeRules(type), ['Used', `${requests} request${requests === 1 ? '' : 's'} so far${requests ? ' (so it can’t be deleted or renamed)' : ''}`] as [string, string]].map(([k, val]) => (
                    <div key={k} className="contents">
                        <dt className="text-[var(--peko-muted)]">{k}</dt>
                        <dd className="m-0 text-[var(--peko-text)]">{val}</dd>
                    </div>
                ))}
            </dl>
            <Text type="secondary" className="mt-3 block text-xs">
                All leave is paid. Loss of pay is the only unpaid leave.
            </Text>
        </Modal>
    ) : null;
