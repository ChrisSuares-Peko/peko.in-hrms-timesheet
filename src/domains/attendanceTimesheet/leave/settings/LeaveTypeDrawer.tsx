// PROTOTYPE-SETUP (Leave module): Leave Policies → Leave types → Add / Edit (a drawer, each field with help text) and
// View (every setting of a type). Editing days, credit method, probation rule, carry forward or who it applies to asks
// for confirmation with the number of employees affected. A used type keeps its name.
import { useEffect, useState } from 'react';

import { Alert, Button, Descriptions, Drawer, Flex, Input, InputNumber, Modal, Radio, Switch, Typography } from 'antd';

import {
    APPLIES_LABEL,
    CREDIT_LABEL,
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
    encashOnExit: false,
    proofAfterDays: null,
    appliesTo: 'ALL',
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
                <Field label="Carry forward up to" help="Unused days moved into the next leave cycle. Anything above this limit lapses." htmlFor="lt-carry">
                    <Flex align="center" gap={8}>
                        <InputNumber id="lt-carry" min={0} max={366} value={v.carryForward} onChange={n => set('carryForward', Number(n ?? 0))} className="!w-[120px]" />
                        <Text type="secondary" className="text-xs">
                            days (0 = no carry forward)
                        </Text>
                    </Flex>
                </Field>
                <Field label="Encash on exit" help="Pay out unused days in the final settlement when someone leaves.">
                    <Flex align="center" gap={8}>
                        <Switch checked={v.encashOnExit} onChange={c => set('encashOnExit', c)} aria-label="Encash on exit" />
                        <Text className="text-sm">{v.encashOnExit ? 'Yes' : 'No'}</Text>
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
                <Descriptions.Item label="Status">{type.active ? 'Active' : 'Inactive (hidden from leave forms)'}</Descriptions.Item>
                <Descriptions.Item label="Days per year">{fmtDays(type.daysPerYear)}</Descriptions.Item>
                <Descriptions.Item label="Credited">{CREDIT_LABEL[type.credit]}</Descriptions.Item>
                <Descriptions.Item label="Accrual rate">{accrualText(type)}</Descriptions.Item>
                <Descriptions.Item label="During probation">{PROBATION_LABEL[type.probation]}</Descriptions.Item>
                <Descriptions.Item label="Carry forward">
                    {carryText(type)}
                    {type.carryForward ? '. Anything above that lapses at the end of the leave cycle.' : '. Unused days lapse at the end of the leave cycle.'}
                </Descriptions.Item>
                <Descriptions.Item label="Encash on exit">{type.encashOnExit ? 'Yes, unused days are paid in the final settlement' : 'No'}</Descriptions.Item>
                <Descriptions.Item label="Supporting document">{proofText(type)}</Descriptions.Item>
                <Descriptions.Item label="Applies to">{APPLIES_LABEL[type.appliesTo]}</Descriptions.Item>
                <Descriptions.Item label="Used">
                    {requests} request{requests === 1 ? '' : 's'} so far{requests ? ' (so it can’t be removed or renamed)' : ''}
                </Descriptions.Item>
            </Descriptions>
            <Text type="secondary" className="mt-3 block text-xs">
                Once someone uses up this type, any extra days are loss of pay.
            </Text>
        </Modal>
    ) : null;
