// PROTOTYPE-SETUP (Leave module; Leave settings rework — notes pay:settings:leave:types): Leave Policies → Leave types
// → Add / Edit (a drawer) and View (every rule of a type, grouped as in the drawer). Help text is in tooltips (InfoTip);
// only values, choices, statuses and errors are on screen.
//   every type ...... Name · Kind (Yearly balance / Per event) · Count leave in · Applicable gender · Show to employees
//   Yearly balance .. Days per year; 1 · During probation; 2 · After probation (credit + the four end-of-cycle options +
//                     carry limit); 3 · When an employee leaves; Requests (half days, supporting documents)
//   Per event ....... Triggered by; Number of days; When the leave can start; Supporting documents
//   Maternity ....... "Statutory leave"; Offer maternity leave (headcount rule); Triggered by (fixed); Days of leave by
//                     child (legal minimum shown); When the leave can start (weeks before / after); Supporting documents
// Changing the rules asks for confirmation with the number of employees affected. A used type keeps its name;
// Maternity can't be renamed or deleted.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Alert, Button, Drawer, Flex, Input, InputNumber, Modal, Radio, Select, Switch, Typography } from 'antd';
import dayjs from 'dayjs';

import InfoTip from '@src/components/peko/InfoTip';
import StatusTag from '@src/components/peko/StatusTag';
import { MATERNITY_MIN } from '@src/prototype/rules/attendance';
import {
    APPLIES_LABEL,
    COUNT_LABEL,
    CREDIT_LABEL,
    MATERNITY_CHILD_LABEL,
    PROBATION_LABEL,
    TRIGGERS,
    accrualText,
    daysText,
    eventDateLabel,
    exitText,
    fmtDays,
    isMaternity,
    limitText,
    maternityPreWeeks,
    proofText,
    typeLabel,
    windowText,
    yearEndText,
} from '@src/prototype/rules/leave';

import type { LeaveExcess, LeaveTrigger, LeaveTypeConfig, LeaveTypeInput, LeaveYearEnd, MaternityRule } from '../../types';

const { Text } = Typography;

/** A drawer section: "1 · During probation" with its tooltip. */
const SectionHeading = ({ title, tip }: { title: string; tip?: ReactNode }) => (
    <div className="border-0 border-t border-solid border-[var(--peko-line)] pt-4" data-lt-section={title}>
        <Text className="inline-flex items-center text-base font-semibold leading-6 text-[var(--peko-text)]">
            {title}
            {tip && <InfoTip title={tip} label={`About ${title}`} />}
        </Text>
    </div>
);

/** A field: a 13px medium label with its explanation in a tooltip, then the control. */
const Field = ({ label, tip, children, htmlFor }: { label: string; tip?: ReactNode; children: ReactNode; htmlFor?: string }) => (
    <Flex vertical gap={6}>
        <label htmlFor={htmlFor} className="inline-flex items-center text-[13px] font-medium text-[var(--peko-text)]">
            {label}
            {tip && <InfoTip title={tip} label={`About ${label}`} />}
        </label>
        {children}
    </Flex>
);

const DEFAULT_MAT: MaternityRule = { d1: 182, d2: 182, d3: 84, pre: 8, post: 0 };

const BLANK: LeaveTypeInput = {
    name: '',
    kind: 'yearly',
    count: 'working',
    daysPerYear: 12,
    credit: 'MONTHLY',
    probation: 'MONTHLY',
    yearEnd: 'lapse',
    excess: 'lapse',
    carryForward: 0,
    exitOpts: [],
    halfDay: true,
    limit: 5,
    limitUnit: 'days',
    trigger: 'other',
    eventLabel: '',
    windowBefore: null,
    windowAfter: null,
    docRequired: false,
    docName: '',
    proofAfterDays: null,
    appliesTo: 'ALL',
    active: true,
};

/** The fields whose change moves balances or entitlements (asks for confirmation). */
const RULE_FIELDS: (keyof LeaveTypeInput)[] = ['kind', 'count', 'daysPerYear', 'credit', 'probation', 'yearEnd', 'excess', 'carryForward', 'appliesTo', 'limit', 'limitUnit', 'mat', 'windowBefore', 'windowAfter'];

/** The four end-of-cycle options as one choice. */
type CycleEnd = 'lapse' | 'encash' | 'carry-lapse' | 'carry-encash';
const cycleEndOf = (v: Pick<LeaveTypeInput, 'yearEnd' | 'excess'>): CycleEnd => {
    if (v.yearEnd === 'carry') return v.excess === 'encash' ? 'carry-encash' : 'carry-lapse';
    return v.yearEnd === 'encash' ? 'encash' : 'lapse';
};
const CYCLE_END: Record<CycleEnd, { yearEnd: LeaveYearEnd; excess: LeaveExcess; label: string }> = {
    lapse: { yearEnd: 'lapse', excess: 'lapse', label: 'All lapse' },
    encash: { yearEnd: 'encash', excess: 'lapse', label: 'All encashed' },
    'carry-lapse': { yearEnd: 'carry', excess: 'lapse', label: 'Carry forward, the rest lapses' },
    'carry-encash': { yearEnd: 'carry', excess: 'encash', label: 'Carry forward, the rest is encashed' },
};

const optional = (n: number | string | null | undefined) => (n === null || n === undefined || n === '' ? null : Number(n));

/** The live example in the start-window tooltip: the event on 1 December. */
export const windowExample = (before: number | null, after: number | null, event: string) => {
    const due = dayjs(`${dayjs().year()}-12-01`);
    const from = before === null ? 'any time before' : due.subtract(before, 'day').format('D MMM');
    const to = after === null ? 'any time after' : due.add(after, 'day').format('D MMM');
    return `Example: ${event} on 1 December → the leave can start from ${from} to ${to}; its days then run on from the start date in one go.`;
};

const offerText = (required: boolean, offer: boolean, headcount: number) => {
    if (required) return `Required (${headcount} employees)`;
    return offer ? 'Offered' : 'Not offered';
};

export const LeaveTypeDrawer = ({
    open,
    type,
    used,
    affected,
    headcount = 0,
    maternityRequired = false,
    matOn = false,
    onClose,
    onSave,
}: {
    open: boolean;
    /** null = a new type. */
    type: LeaveTypeConfig | null;
    used: boolean;
    /** Employees the type applies to now (for the confirmation). */
    affected: number;
    /** Current employees, and whether Maternity is required (more than 10) — for the Maternity switch. */
    headcount?: number;
    maternityRequired?: boolean;
    matOn?: boolean;
    onClose: () => void;
    /** Saves the type; for Maternity also whether it's offered (when it's optional). */
    onSave: (input: LeaveTypeInput, extra?: { matOn?: boolean }) => Promise<boolean>;
}) => {
    const [v, setV] = useState<LeaveTypeInput>(BLANK);
    const [offer, setOffer] = useState(false);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const maternity = isMaternity(type);

    useEffect(() => {
        if (!open) return;
        setV(type ? { ...type } : BLANK);
        setOffer(maternityRequired || matOn);
        setError('');
        setConfirming(false);
    }, [open, type, maternityRequired, matOn]);

    const set = <K extends keyof LeaveTypeInput>(k: K, value: LeaveTypeInput[K]) => {
        setV(cur => ({ ...cur, [k]: value }));
        setError('');
        setConfirming(false);
    };
    const mat = v.mat ?? DEFAULT_MAT;
    const setMat = (k: keyof MaternityRule, value: number) => set('mat', { ...mat, [k]: value });
    const changesRules = Boolean(type) && RULE_FIELDS.some(k => JSON.stringify((type as LeaveTypeInput)[k] ?? null) !== JSON.stringify(v[k] ?? null));
    const event = v.kind === 'event';

    const save = async () => {
        if (!v.name.trim()) return setError('Give the leave type a name.');
        if (!event && !(v.daysPerYear > 0)) return setError('Enter the days per year.');
        if (event && !maternity && !((v.limit ?? 0) > 0)) return setError('Enter how many days one event gives.');
        if (maternity && (mat.d1 < MATERNITY_MIN.d1 || mat.d2 < MATERNITY_MIN.d2 || mat.d3 < MATERNITY_MIN.d3)) {
            return setError(`Days by child can’t go below the legal minimum (${MATERNITY_MIN.d1} / ${MATERNITY_MIN.d2} / ${MATERNITY_MIN.d3}).`);
        }
        if (changesRules && !confirming) {
            setConfirming(true);
            return undefined;
        }
        setBusy(true);
        const ok = await onSave({ ...v, name: v.name.trim() }, maternity ? { matOn: offer } : undefined);
        setBusy(false);
        if (ok) onClose();
        return undefined;
    };

    const monthly = v.daysPerYear / 12;
    const cycleEnd = cycleEndOf(v);
    const carrying = v.yearEnd === 'carry';
    const probationOn = v.probation !== 'NONE';
    let saveLabel = 'Add leave type';
    if (type) saveLabel = confirming ? 'Confirm and save' : 'Save changes';
    const triggerDate = eventDateLabel({ id: '', trigger: v.trigger, eventLabel: v.eventLabel });
    const eventWord = triggerDate.toLowerCase().replace(/^date of (the )?/, '');

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={
                <span className="inline-flex items-center gap-2">
                    {type ? `Edit ${type.name}` : 'Add leave type'}
                    {maternity && (
                        <StatusTag tone="info" className="!m-0" data-statutory>
                            Statutory leave
                        </StatusTag>
                    )}
                </span>
            }
            width={560}
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
                    {error && <Alert type="error" showIcon message={error} data-lt-error />}
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
                {maternity && (
                    <Text className="inline-flex items-center text-[13px] text-[var(--peko-text-2)]" data-maternity-note>
                        Code on Social Security, 2020
                        <InfoTip
                            title="Every company has Maternity. Its numbers follow the Code on Social Security, 2020: you can be more generous than the law, never less. It can’t be deleted or renamed."
                            label="About statutory maternity leave"
                        />
                    </Text>
                )}
                <Field label="Name" tip="What employees see when they apply, e.g. Annual, Sick, Bereavement leave. A type that has been used keeps its name." htmlFor="lt-name">
                    <Input id="lt-name" value={v.name} disabled={used || maternity} placeholder="e.g. Bereavement leave" onChange={e => set('name', e.target.value)} maxLength={40} />
                </Field>
                {!maternity && (
                    <>
                        <Field label="Kind" tip="Yearly balance: days credited over the leave cycle (annual, casual, sick). Per event: leave for an event such as a birth, adoption or surgery, with no yearly balance.">
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
                        <Field label="Count leave in" tip="Working days skip the employee’s own weekly offs and public holidays. Calendar days count every day in the range, as statutory leave does.">
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
                        <Field label="Applicable gender" tip="Who can apply for it. Other employees don’t see this type at all.">
                            <Radio.Group
                                optionType="button"
                                value={v.appliesTo}
                                onChange={e => set('appliesTo', e.target.value)}
                                aria-label="Applicable gender"
                                data-lt-gender
                                options={[
                                    { value: 'ALL', label: 'All' },
                                    { value: 'FEMALE', label: 'Female' },
                                    { value: 'MALE', label: 'Male' },
                                ]}
                            />
                        </Field>
                    </>
                )}

                {!event && (
                    <>
                        <Field label="Days per year" tip="Days of this leave in a full leave cycle. Joiners and leavers get a pro-rated share (a month counts if they join on or before the 15th)." htmlFor="lt-days">
                            <Flex align="center" gap={8}>
                                <InputNumber id="lt-days" min={0.5} max={366} step={0.5} value={v.daysPerYear} onChange={n => set('daysPerYear', Number(n ?? 0))} className="!w-[120px]" />
                                <Text type="secondary" className="text-xs">
                                    {fmtDays(monthly)} a month
                                </Text>
                            </Flex>
                        </Field>

                        <SectionHeading title="1 · During probation" tip="New joiners on Probation follow this rule until HR marks them Active (Payroll → Leave → Balances). There’s no probation length to set." />
                        <Field label="Can employees on probation use it?" tip="No: nothing is credited until HR marks the employee Active.">
                            <Radio.Group
                                optionType="button"
                                value={probationOn ? 'yes' : 'no'}
                                onChange={e => set('probation', e.target.value === 'no' ? 'NONE' : 'MONTHLY')}
                                aria-label="Can employees on probation use it?"
                                data-lt-prob-on
                                options={[
                                    { value: 'yes', label: 'Yes' },
                                    { value: 'no', label: 'No' },
                                ]}
                            />
                        </Field>
                        {probationOn && (
                            <Field label="How it’s credited during probation" tip="Monthly: a twelfth of the year each month. Daily: a little every day. All at once: the full year’s days straight away.">
                                <Radio.Group
                                    optionType="button"
                                    value={v.probation}
                                    onChange={e => set('probation', e.target.value)}
                                    aria-label="How it’s credited during probation"
                                    data-lt-prob
                                    options={[
                                        { value: 'MONTHLY', label: 'Monthly' },
                                        { value: 'DAILY', label: 'Daily' },
                                        { value: 'FULL', label: 'All at once' },
                                    ]}
                                />
                            </Field>
                        )}

                        <SectionHeading title="2 · After probation" tip="Regular employees. The day of the month for monthly credits (and the time for daily ones) is set in Configuration → Credit date." />
                        <Field label="How it’s credited" tip={`All at once: the full year’s days on the first day of the cycle. Monthly: ${daysText(monthly)} each month. Daily: about ${daysText(monthly)} a month, a little every day.`}>
                            <Radio.Group
                                optionType="button"
                                value={v.credit}
                                onChange={e => set('credit', e.target.value)}
                                aria-label="How it’s credited"
                                data-lt-credit
                                options={[
                                    { value: 'CYCLE_START', label: 'All at once' },
                                    { value: 'MONTHLY', label: 'Monthly' },
                                    { value: 'DAILY', label: 'Daily' },
                                ]}
                            />
                        </Field>
                        <Field
                            label="At the end of the leave cycle"
                            tip="Runs automatically on the last working day of the cycle. Carry forward moves unused days into the next cycle up to the limit; above it, days lapse or are paid out by payroll."
                        >
                            <Radio.Group
                                value={cycleEnd}
                                onChange={e => {
                                    const c = CYCLE_END[e.target.value as CycleEnd];
                                    setV(cur => ({ ...cur, yearEnd: c.yearEnd, excess: c.excess }));
                                    setError('');
                                    setConfirming(false);
                                }}
                                aria-label="At the end of the leave cycle"
                                className="flex flex-col gap-1.5"
                                data-lt-year-end
                                options={(Object.keys(CYCLE_END) as CycleEnd[]).map(k => ({ value: k, label: CYCLE_END[k].label }))}
                            />
                            {carrying && (
                                <Flex align="center" gap={8} className="mt-1">
                                    <Text className="text-sm">Carry forward up to</Text>
                                    <InputNumber min={0} max={366} value={v.carryForward} onChange={n => set('carryForward', Number(n ?? 0))} className="!w-[90px]" aria-label="Carry forward up to" data-lt-carry />
                                    <Text className="text-sm">days</Text>
                                </Flex>
                            )}
                        </Field>

                        <SectionHeading title="3 · When an employee leaves" tip="Leave is pro-rated to the last working day. Full and final settlement is a later module: this records the rule only." />
                        <Field label="Unused leave">
                            <Radio.Group
                                value={v.exitOpts[0] ?? 'lapse'}
                                onChange={e => set('exitOpts', e.target.value === 'lapse' ? [] : [e.target.value])}
                                aria-label="Unused leave on leaving"
                                className="flex flex-col gap-1.5"
                                data-lt-exit
                                options={[
                                    { value: 'encash', label: 'Encash' },
                                    { value: 'prepone', label: 'Bring last working day forward' },
                                    { value: 'lapse', label: 'Lapse' },
                                ]}
                            />
                        </Field>

                        <SectionHeading title="Requests" />
                        <Field label="Half days" tip="Off: the Apply form only offers full days for this type.">
                            <Switch checked={v.halfDay} onChange={c => set('halfDay', c)} aria-label="Half days" className="self-start" data-lt-half-day />
                        </Field>
                        <Field label="Supporting documents" tip="When on, employees attach a document (e.g. a medical certificate) for leave longer than the number of days set; 0 = every request.">
                            <Flex align="center" gap={8} wrap="wrap">
                                <Switch checked={v.proofAfterDays !== null} onChange={c => set('proofAfterDays', c ? 3 : null)} aria-label="Supporting documents" data-lt-docs />
                                {v.proofAfterDays !== null && (
                                    <>
                                        <Text className="text-sm">for leave longer than</Text>
                                        <InputNumber min={0} max={366} value={v.proofAfterDays} onChange={n => set('proofAfterDays', Number(n ?? 0))} className="!w-[80px]" aria-label="Documents for leave longer than" data-lt-proof />
                                        <Text className="text-sm">days</Text>
                                    </>
                                )}
                            </Flex>
                        </Field>
                    </>
                )}

                {event && !maternity && (
                    <>
                        <SectionHeading title="Per event" tip="No yearly balance, accrual, carry forward or leaving rule. One request per event, taken in one go." />
                        <Field label="Triggered by" tip="The event the leave is for. It decides the date employees are asked for.">
                            <Select<LeaveTrigger>
                                value={v.trigger}
                                onChange={t => set('trigger', t)}
                                aria-label="Triggered by"
                                data-lt-trigger
                                options={(Object.keys(TRIGGERS) as LeaveTrigger[]).map(k => ({ value: k, label: TRIGGERS[k].label }))}
                            />
                            {v.trigger === 'other' && (
                                <Input value={v.eventLabel} placeholder="Date asked on the request, e.g. Date of the move" maxLength={60} onChange={e => set('eventLabel', e.target.value)} aria-label="Event date label" data-lt-event-label />
                            )}
                            <Text type="secondary" className="text-xs">
                                Employees enter: {triggerDate}
                            </Text>
                        </Field>
                        <Field label="Number of days" tip="For one event, taken in one go, counted as set above (working or calendar days)." htmlFor="lt-limit">
                            <Flex align="center" gap={8}>
                                <InputNumber id="lt-limit" min={1} max={v.limitUnit === 'weeks' ? 52 : 366} value={v.limit ?? undefined} onChange={n => set('limit', optional(n))} className="!w-[100px]" data-lt-limit />
                                <Radio.Group
                                    optionType="button"
                                    value={v.limitUnit}
                                    onChange={e => set('limitUnit', e.target.value)}
                                    aria-label="Days or weeks"
                                    options={[
                                        { value: 'days', label: 'Days' },
                                        { value: 'weeks', label: 'Weeks' },
                                    ]}
                                />
                            </Flex>
                        </Field>
                        <Field label="When the leave can start" tip={`The start date has to fall in this window around the event; empty = no limit on that side. ${windowExample(v.windowBefore, v.windowAfter, eventWord)}`}>
                            <Flex align="center" gap={8} wrap="wrap" className="text-sm">
                                From
                                <InputNumber min={0} max={366} value={v.windowBefore ?? undefined} placeholder="Any" onChange={n => set('windowBefore', optional(n))} className="!w-[80px]" aria-label="Days before the event" data-lt-before />
                                days before to
                                <InputNumber min={0} max={366} value={v.windowAfter ?? undefined} placeholder="Any" onChange={n => set('windowAfter', optional(n))} className="!w-[80px]" aria-label="Days after the event" data-lt-after />
                                days after
                            </Flex>
                            <Text type="secondary" className="text-xs" data-lt-window-text>
                                {windowText({ id: '', trigger: v.trigger, eventLabel: v.eventLabel, windowBefore: v.windowBefore, windowAfter: v.windowAfter })}
                            </Text>
                        </Field>
                        <Field label="Supporting documents" tip="When on, every request needs a document; say what to ask for.">
                            <Flex vertical gap={6}>
                                <Switch checked={v.docRequired} onChange={c => set('docRequired', c)} aria-label="Supporting documents" className="self-start" data-lt-doc-required />
                                {v.docRequired && <Input value={v.docName} placeholder="e.g. Birth certificate or adoption order" maxLength={80} onChange={e => set('docName', e.target.value)} aria-label="What to ask for" data-lt-doc-name />}
                            </Flex>
                        </Field>
                    </>
                )}

                {maternity && (
                    <>
                        <Field
                            label="Offer maternity leave"
                            tip={`Required with more than 10 current employees (people in Employees without a past leaving date): always on. With 10 or fewer it’s optional and off by default. You have ${headcount}.`}
                        >
                            <Flex align="center" gap={8}>
                                <Switch checked={offer} disabled={maternityRequired} onChange={setOffer} aria-label="Offer maternity leave" data-mat-offer />
                                <Text className="text-sm">{offerText(maternityRequired, offer, headcount)}</Text>
                            </Flex>
                        </Field>
                        <Field label="Triggered by">
                            <Text className="text-sm" data-mat-trigger>
                                Expected or actual date of delivery
                            </Text>
                        </Field>
                        <Field label="Days of leave by child" tip="Calendar days, from the start date in one go. Employees say which child it is when they apply; approvers check it.">
                            <Flex vertical gap={8}>
                                {([1, 2, 3] as const).map(c => {
                                    const key = `d${c}` as 'd1' | 'd2' | 'd3';
                                    const min = MATERNITY_MIN[key];
                                    return (
                                        <Flex key={c} align="center" gap={8} wrap="wrap">
                                            <Text className="w-[150px] text-sm">{MATERNITY_CHILD_LABEL[c]}</Text>
                                            <InputNumber min={0} max={366} value={mat[key]} onChange={n => setMat(key, Number(n ?? 0))} className="!w-[90px]" aria-label={`${MATERNITY_CHILD_LABEL[c]} days`} status={mat[key] < min ? 'error' : undefined} data-mat-days={c} />
                                            <Text type="secondary" className="text-xs">
                                                days · legal minimum {min}
                                            </Text>
                                        </Flex>
                                    );
                                })}
                            </Flex>
                        </Field>
                        <Field label="When the leave can start" tip={`The law caps “before” at 8 weeks (6 for the third child or later, applied automatically). ${windowExample(maternityPreWeeks(mat, 1) * 7, mat.post * 7, 'due date')}`}>
                            <Flex align="center" gap={8} wrap="wrap" className="text-sm">
                                From
                                <InputNumber min={0} max={MATERNITY_MIN.preMax} value={mat.pre} onChange={n => setMat('pre', Number(n ?? 0))} className="!w-[70px]" aria-label="Weeks before the delivery date" data-mat-pre />
                                weeks before the delivery date to
                                <InputNumber min={0} max={52} value={mat.post} onChange={n => setMat('post', Number(n ?? 0))} className="!w-[70px]" aria-label="Weeks after the delivery date" data-mat-post />
                                weeks after it
                            </Flex>
                        </Field>
                        <Field label="Supporting documents" tip="On by default. Say what to ask for.">
                            <Flex vertical gap={6}>
                                <Switch checked={v.docRequired} onChange={c => set('docRequired', c)} aria-label="Supporting documents" className="self-start" data-lt-doc-required />
                                {v.docRequired && <Input value={v.docName} placeholder="e.g. Medical certificate with the expected date of delivery" maxLength={80} onChange={e => set('docName', e.target.value)} aria-label="What to ask for" data-lt-doc-name />}
                            </Flex>
                        </Field>
                    </>
                )}

                {!maternity && (
                    <Field label="Show to employees" tip="Off: employees don’t see this type. Nothing is deleted: balances and past leave stay, and HR can still see it.">
                        <Flex align="center" gap={8}>
                            <Switch checked={v.active !== false} onChange={c => set('active', c)} aria-label="Show to employees" data-show-to-employees />
                            <Text className="text-sm">{v.active === false ? 'Hidden (inactive)' : 'Shown'}</Text>
                        </Flex>
                    </Field>
                )}
            </Flex>
        </Drawer>
    );
};

const kindText = (type: LeaveTypeConfig) => {
    if (isMaternity(type)) return 'Statutory, per event';
    return type.kind === 'event' ? 'Per event (no yearly balance)' : 'Yearly balance';
};

/** Every rule of a type in plain language, grouped as in the drawer (the View popup). */
export const leaveTypeRules = (type: LeaveTypeConfig): { group: string; rows: [string, string][] }[] => {
    const basics: [string, string][] = [
        ['Status', type.active ? 'Active (shown to employees)' : 'Inactive (hidden from employees)'],
        ['Kind', kindText(type)],
        ['Counted in', COUNT_LABEL[type.count]],
        ['Applicable gender', APPLIES_LABEL[type.appliesTo]],
    ];
    if (isMaternity(type)) {
        const m = type.mat ?? DEFAULT_MAT;
        return [
            { group: 'Leave type', rows: basics },
            {
                group: 'Per event',
                rows: [
                    ['Triggered by', eventDateLabel(type)],
                    ['Days by child', `${MATERNITY_CHILD_LABEL[1]} ${m.d1} · ${MATERNITY_CHILD_LABEL[2]} ${m.d2} · ${MATERNITY_CHILD_LABEL[3]} ${m.d3}`],
                    ['When it can start', `From ${m.pre} weeks before (at most 6 for the third child or later) to ${m.post} weeks after the delivery date`],
                    ['Supporting documents', type.docRequired ? type.docName || 'Required' : 'Not needed'],
                ],
            },
        ];
    }
    if (type.kind === 'event') {
        return [
            { group: 'Leave type', rows: basics },
            {
                group: 'Per event',
                rows: [
                    ['Triggered by', `${TRIGGERS[type.trigger]?.label ?? 'Other event'} (asks for: ${eventDateLabel(type)})`],
                    ['Number of days', `${limitText(type)} for one event, taken in one go`],
                    ['When it can start', windowText(type)],
                    ['Supporting documents', type.docRequired ? type.docName || 'Required' : 'Not needed'],
                ],
            },
        ];
    }
    return [
        { group: 'Leave type', rows: [...basics, ['Days per year', `${fmtDays(type.daysPerYear)} (${fmtDays(type.daysPerYear / 12)} a month)`]] },
        { group: '1 · During probation', rows: [['Rule', PROBATION_LABEL[type.probation]]] },
        {
            group: '2 · After probation',
            rows: [
                ['Credited', `${CREDIT_LABEL[type.credit]} · ${accrualText(type)}`],
                ['End of the leave cycle', yearEndText(type)],
            ],
        },
        { group: '3 · When an employee leaves', rows: [['Unused leave', exitText(type)]] },
        {
            group: 'Requests',
            rows: [
                ['Half days', type.halfDay ? 'Allowed' : 'Not allowed'],
                ['Supporting documents', proofText(type)],
            ],
        },
    ];
};

export const LeaveTypeView = ({ type, requests, onClose, onEdit }: { type: LeaveTypeConfig | null; requests: number; onClose: () => void; onEdit: () => void }) =>
    type ? (
        <Modal
            open
            title={
                <span className="inline-flex items-center gap-2">
                    {typeLabel(type.name)}
                    {isMaternity(type) && (
                        <StatusTag tone="info" className="!m-0">
                            Statutory leave
                        </StatusTag>
                    )}
                </span>
            }
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
            <Flex vertical gap={14} data-leave-type-view>
                {leaveTypeRules(type).map(g => (
                    <div key={g.group} data-view-group={g.group}>
                        <Text className="mb-1.5 block text-[13px] font-semibold text-[var(--peko-text)]">{g.group}</Text>
                        <dl className="m-0 grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                            {g.rows.map(([k, val]) => (
                                <div key={k} className="contents">
                                    <dt className="text-[var(--peko-muted)]">{k}</dt>
                                    <dd className="m-0 text-[var(--peko-text)]">{val}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                ))}
                <Text type="secondary" className="text-xs">
                    Used in {requests} request{requests === 1 ? '' : 's'}
                    {requests ? ', so it can’t be deleted or renamed' : ''}.
                </Text>
            </Flex>
        </Modal>
    ) : null;
