// PROTOTYPE-SETUP (Leave module): Leave Policies → Leave types → Add / Edit (a drawer, each field with help text) and
// View (every setting of a type). Editing days, credit method, probation rule, carry forward or who it applies to asks
// for confirmation with the number of employees affected. A used type keeps its name.
// Drawer sections (notes pay:settings:leave:types): top (name, days, credited) · "When an employee joins" (pro-rated
// note, During probation) · "When an employee leaves" (pro-rated note, Unused leave on leaving: encash in full & final
// settlement or bring the last working day forward, stored only) · "Other" (carry forward, supporting document,
// applies to, Show to employees: off = deactivated, hidden from employees, nothing deleted).
import { useEffect, useState } from 'react';

import { Alert, Button, Descriptions, Drawer, Flex, Input, InputNumber, Modal, Radio, Switch, Typography } from 'antd';

import {
    APPLIES_LABEL,
    CREDIT_LABEL,
    ON_LEAVING_LABEL,
    PROBATION_LABEL,
    accrualText,
    carryText,
    daysText,
    fmtDays,
    proofText,
    typeLabel,
} from '@src/prototype/rules/leave';

import type { LeaveTypeConfig, LeaveTypeInput } from '../../types';

const { Text } = Typography;

const SectionHeading = ({ title, note }: { title: string; note: string }) => (
    <div className="border-0 border-t border-solid border-[#EAECF0] pt-3" data-lt-section={title}>
        <Text className="block text-sm font-medium text-[#101828]">{title}</Text>
        <Text type="secondary" className="text-xs">
            {note}
        </Text>
    </div>
);

const Field = ({ label, help, children, htmlFor }: { label: string; help: string; children: React.ReactNode; htmlFor?: string }) => (
    <Flex vertical gap={4}>
        <label htmlFor={htmlFor} className="text-sm font-semibold text-[#171717]">
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
    daysPerYear: 12,
    credit: 'MONTHLY',
    probation: 'MONTHLY',
    carryForward: 0,
    onLeaving: 'BRING_FORWARD',
    proofAfterDays: null,
    appliesTo: 'ALL',
    active: true,
};

/** The fields whose change moves balances (asks for confirmation). */
const BALANCE_FIELDS: (keyof LeaveTypeInput)[] = ['daysPerYear', 'credit', 'probation', 'carryForward', 'appliesTo'];

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
    const changesBalances = Boolean(type) && BALANCE_FIELDS.some(k => (type as LeaveTypeInput)[k] !== v[k]);

    const save = async () => {
        if (!v.name.trim()) return setError('Give the leave type a name.');
        if (!(v.daysPerYear > 0)) return setError('Enter the days per year.');
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
            width={520}
            destroyOnHidden
            styles={{ wrapper: { maxWidth: '100vw' } }}
            footer={
                <Flex vertical gap={8}>
                    {confirming && (
                        <Alert
                            type="warning"
                            showIcon
                            data-confirm-affected
                            message={`This changes ${type?.name} balances for ${affected} employee${affected === 1 ? '' : 's'} from today. Leave that’s already approved stays as it is.`}
                        />
                    )}
                    {error && <Alert type="error" showIcon message={error} />}
                    <Flex justify="end" gap={8}>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button type="primary" danger loading={busy} onClick={save} data-save-leave-type>
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
                <Field label="Days per year" help="How many days of this leave each employee gets in a full leave cycle. Joiners and leavers get a pro-rated share." htmlFor="lt-days">
                    <Flex align="center" gap={8}>
                        <InputNumber id="lt-days" min={0.5} max={366} step={0.5} value={v.daysPerYear} onChange={n => set('daysPerYear', Number(n ?? 0))} className="!w-[120px]" />
                        <Text type="secondary" className="text-xs">
                            days ({fmtDays(monthly)} a month)
                        </Text>
                    </Flex>
                </Field>
                <Field label="Credited" help="When the days land in the employee’s balance.">
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
                        {v.credit === 'MONTHLY' && `${daysText(monthly)} land on the 1st of each month.`}
                        {v.credit === 'DAILY' && `A little is added every day, about ${daysText(monthly)} a month.`}
                    </Text>
                </Field>
                <SectionHeading title="When an employee joins" note="Joiners get a pro-rated share for the rest of the leave cycle." />
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
                    title="When an employee leaves"
                    note="Leave is pro-rated for the year up to their last working day. What they have left can then be used one of two ways."
                />
                <Field label="Unused leave on leaving" help="Full and final settlement is a separate module that comes later; this setting only records the choice.">
                    <Radio.Group
                        value={v.onLeaving}
                        onChange={e => set('onLeaving', e.target.value)}
                        aria-label="Unused leave on leaving"
                        className="flex flex-col gap-1.5"
                        options={(['ENCASH', 'BRING_FORWARD'] as const).map(o => ({ value: o, label: ON_LEAVING_LABEL[o] }))}
                    />
                </Field>
                <SectionHeading title="Other" note="Carry forward, documents, who it’s for, and whether employees see it." />
                <Field label="Carry forward up to" help="Unused days moved into the next leave cycle. Anything above this limit lapses." htmlFor="lt-carry">
                    <Flex align="center" gap={8}>
                        <InputNumber id="lt-carry" min={0} max={366} value={v.carryForward} onChange={n => set('carryForward', Number(n ?? 0))} className="!w-[120px]" />
                        <Text type="secondary" className="text-xs">
                            days (0 = no carry forward)
                        </Text>
                    </Flex>
                </Field>
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
                            onChange={n => set('proofAfterDays', n === null || n === undefined ? null : Number(n))}
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
                    Every leave type is paid. When someone uses up a type, any extra days are loss of pay.
                </Text>
            </Flex>
        </Drawer>
    );
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
                <Button key="e" type="primary" danger onClick={onEdit}>
                    Edit
                </Button>,
            ]}
        >
            <Descriptions column={1} size="small" bordered data-leave-type-view>
                <Descriptions.Item label="Status">{type.active ? 'Active (shown to employees)' : 'Inactive (hidden from employees)'}</Descriptions.Item>
                <Descriptions.Item label="Days per year">{fmtDays(type.daysPerYear)}</Descriptions.Item>
                <Descriptions.Item label="Credited">{CREDIT_LABEL[type.credit]}</Descriptions.Item>
                <Descriptions.Item label="Accrual rate">{accrualText(type)}</Descriptions.Item>
                <Descriptions.Item label="During probation">{PROBATION_LABEL[type.probation]}</Descriptions.Item>
                <Descriptions.Item label="Carry forward">
                    {carryText(type)}
                    {type.carryForward ? '. Anything above that lapses at the end of the leave cycle.' : '. Unused days lapse at the end of the leave cycle.'}
                </Descriptions.Item>
                <Descriptions.Item label="When leaving">
                    Pro-rated to the last working day;{' '}
                    {type.onLeaving === 'ENCASH' ? 'unused days encashed in full & final settlement' : 'unused days used to bring the last working day forward'}
                </Descriptions.Item>
                <Descriptions.Item label="Supporting document">{proofText(type)}</Descriptions.Item>
                <Descriptions.Item label="Applies to">{APPLIES_LABEL[type.appliesTo]}</Descriptions.Item>
                <Descriptions.Item label="Used">
                    {requests} request{requests === 1 ? '' : 's'} so far{requests ? ' (so it can’t be deleted or renamed)' : ''}
                </Descriptions.Item>
            </Descriptions>
            <Text type="secondary" className="mt-3 block text-xs">
                Once someone uses up this type, any extra days are loss of pay.
            </Text>
        </Modal>
    ) : null;
