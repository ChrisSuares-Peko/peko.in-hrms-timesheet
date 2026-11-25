// PROTOTYPE-SETUP (Leave fixes — notes pay:settings:leave:holidays → "Holidays with ranges"): Add holiday / Edit open
// this popup: Holiday name, From, To (same as From for a one-day holiday), at most 31 days, no date that's already
// another holiday. The days count shows under the dates. Saving sends { name, from, to }; Edit replaces the holiday's
// dates (it may keep its own).
import { useEffect, useState } from 'react';

import { Alert, DatePicker, Flex, Input, Modal, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import InfoTip from '@src/components/peko/InfoTip';
import { datesBetween, holidayRangeProblem, type HolidayGroup } from '@src/prototype/rules/holidayImport';

const { Text } = Typography;

const HolidayEditModal = ({
    open,
    holiday,
    existing,
    onClose,
    onSave,
}: {
    open: boolean;
    /** The holiday being edited; null = Add holiday. */
    holiday: HolidayGroup | null;
    /** Every holiday date (for the overlap check). */
    existing: string[];
    onClose: () => void;
    onSave: (h: { name: string; from: string; to: string }) => Promise<boolean>;
}) => {
    const [name, setName] = useState('');
    const [from, setFrom] = useState<Dayjs | null>(null);
    const [to, setTo] = useState<Dayjs | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        setName(holiday?.name ?? '');
        setFrom(holiday ? dayjs(holiday.from) : null);
        setTo(holiday ? dayjs(holiday.to) : null);
        setError('');
    }, [open, holiday]);
    const f = from?.format('YYYY-MM-DD') ?? '';
    const t = to?.format('YYYY-MM-DD') ?? f;
    const days = f && t >= f ? datesBetween(f, t).length : 0;
    const save = async () => {
        const problem = holidayRangeProblem({ name, from: f, to: t }, existing, holiday ? datesBetween(holiday.from, holiday.to) : []);
        if (problem) return setError(problem.clash ? `${dayjs(problem.clash).format('D MMM YYYY')} is already a holiday.` : problem.message);
        setBusy(true);
        const ok = await onSave({ name: name.trim(), from: f, to: t });
        setBusy(false);
        if (ok) onClose();
        return undefined;
    };
    return (
        <Modal
            open={open}
            title={holiday ? 'Edit holiday' : 'Add holiday'}
            width={460}
            destroyOnHidden
            onCancel={onClose}
            onOk={save}
            okText={holiday ? 'Save changes' : 'Add holiday'}
            okButtonProps={{ loading: busy, ...({ 'data-holiday-save': true } as Record<string, unknown>) }}
        >
            <Flex vertical gap={12} data-holiday-modal>
                <Flex vertical gap={4}>
                    <Text className="text-[13px] font-medium">Holiday name</Text>
                    <Input
                        value={name}
                        maxLength={60}
                        placeholder="e.g. Diwali"
                        aria-label="Holiday name"
                        onChange={e => {
                            setName(e.target.value);
                            setError('');
                        }}
                        data-holiday-name
                    />
                </Flex>
                <Flex gap={12} wrap="wrap">
                    <Flex vertical gap={4} className="min-w-[160px] flex-1">
                        <Text className="text-[13px] font-medium">From</Text>
                        <DatePicker
                            value={from}
                            format="D MMM YYYY"
                            aria-label="From"
                            allowClear={false}
                            onChange={d => {
                                setFrom(d);
                                if (d && (!to || to.isBefore(d, 'day'))) setTo(d);
                                setError('');
                            }}
                            data-holiday-from
                        />
                    </Flex>
                    <Flex vertical gap={4} className="min-w-[160px] flex-1">
                        <Text className="inline-flex items-center text-[13px] font-medium">
                            To
                            <InfoTip title="Same as From for a one-day holiday. Use a range for holidays like Diwali that run over several days." label="About the end date" />
                        </Text>
                        <DatePicker
                            value={to}
                            format="D MMM YYYY"
                            aria-label="To"
                            allowClear={false}
                            disabledDate={d => Boolean(from && d.isBefore(from, 'day'))}
                            onChange={d => {
                                setTo(d);
                                setError('');
                            }}
                            data-holiday-to
                        />
                    </Flex>
                </Flex>
                {days > 0 && (
                    <Text type="secondary" className="text-xs" data-holiday-days>
                        {days} day{days === 1 ? '' : 's'}
                    </Text>
                )}
                {error && <Alert type="error" showIcon message={error} data-holiday-error />}
            </Flex>
        </Modal>
    );
};

export default HolidayEditModal;
