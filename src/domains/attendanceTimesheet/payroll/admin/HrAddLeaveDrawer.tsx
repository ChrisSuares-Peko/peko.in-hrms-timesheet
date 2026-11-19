// PROTOTYPE-SETUP (Leave module): Payroll → Leave → "Add leave" (HR adds leave for an employee).
//   Employee, Start date, End date → the duration worked out ("3 working days · weekly offs and public holidays aren’t
//   counted"), Full days or the first / second half of each day, Leave type (with what's available for them), Note,
//   an optional attachment. The same checks as the employee's form (overlap, balance, probation); approved straight
//   away and marked "Added by HR"; their attendance and timesheet update at once.
import { useEffect, useMemo, useState } from 'react';

import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Drawer, Flex, Input, Radio, Select, Typography, Upload } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import { useAppDispatch } from '@src/hooks/store';
import { RuleError } from '@src/prototype/rules/attendance';
import { countLeaveDays, daysText, fmtDays, validateLeave } from '@src/prototype/rules/leave';
import { showToast } from '@src/slices/apiSlice';

import { getAdminPeople, getEmployeeLeaveTypes, hrAddLeave } from '../../api';
import { DATE_FORMATS, calendarFrom, typeOf } from '../../leave/ApplyLeaveModal';
import type { LeaveHalf, PersonRef } from '../../types';
import { usePayrollScope } from '../usePayrollAts';

const { Text } = Typography;

type Info = Exclude<Awaited<ReturnType<typeof getEmployeeLeaveTypes>>, false>;
const iso = (d: Dayjs | null) => (d ? d.format('YYYY-MM-DD') : '');

const HrAddLeaveDrawer = ({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) => {
    const scope = usePayrollScope();
    const dispatch = useAppDispatch();
    const [people, setPeople] = useState<PersonRef[]>([]);
    const [employeeId, setEmployeeId] = useState<number | null>(null);
    const [info, setInfo] = useState<Info | null>(null);
    const [from, setFrom] = useState<Dayjs | null>(null);
    const [to, setTo] = useState<Dayjs | null>(null);
    const [half, setHalf] = useState<'NONE' | LeaveHalf>('NONE');
    const [type, setType] = useState<string>('');
    const [note, setNote] = useState('');
    const [attachment, setAttachment] = useState<{ name: string } | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        getAdminPeople(scope).then(res => setPeople(res || []));
        setEmployeeId(null);
        setInfo(null);
        setFrom(null);
        setTo(null);
        setHalf('NONE');
        setType('');
        setNote('');
        setAttachment(null);
        setError('');
    }, [open, scope]);

    useEffect(() => {
        setInfo(null);
        if (!employeeId) return;
        getEmployeeLeaveTypes(scope, employeeId).then(res => {
            if (!res) return;
            setInfo(res);
            setType(t => (res.balances.some(b => b.type === t) ? t : res.balances.find(b => b.type === 'ANNUAL')?.type ?? res.balances[0]?.type ?? ''));
        });
    }, [employeeId, scope]);

    const cal = useMemo(() => (info ? calendarFrom(info.calendar) : null), [info]);
    const start = iso(from);
    const end = iso(to) || start;
    const halfOf = half === 'NONE' ? null : half;
    // Without an employee yet, count against the company's Monday–Friday week (it's recounted once one is picked).
    const count =
        start && end >= start
            ? countLeaveDays(start, end, halfOf, cal ?? { weeklyOff: ['SATURDAY', 'SUNDAY'], isHoliday: () => false }, info?.rules.sandwich ?? 'OFF')
            : null;
    const person = people.find(p => p.id === employeeId);
    const first = person?.name.split(' ')[0] ?? '';
    const b = info?.balances.find(x => x.type === type);

    const save = async () => {
        if (!employeeId || !info || !cal) return setError('Pick an employee.');
        if (!start || !iso(to)) return setError('Pick the start and end dates.');
        try {
            validateLeave(
                { type, start, end, half: halfOf, reason: note, proof: attachment },
                {
                    types: info.balances.map(typeOf),
                    cal,
                    sandwich: info.rules.sandwich,
                    halfDayAllowed: true,
                    existing: info.existing,
                    available: Object.fromEntries(info.balances.map(x => [x.type, x.available])),
                    pending: Object.fromEntries(info.balances.map(x => [x.type, x.inRequest])),
                    onProbation: info.status === 'PROBATION',
                    who: first,
                    reasonMessage: 'Add a short note.',
                }
            );
        } catch (e) {
            if (e instanceof RuleError) return setError(e.message);
            throw e;
        }
        setBusy(true);
        const res = await hrAddLeave(scope, { employeeId, type, start, end, half: halfOf, note: note.trim(), attachment });
        setBusy(false);
        if (!res) return undefined;
        dispatch(showToast({ variant: 'success', description: res.message }));
        onAdded();
        onClose();
        return undefined;
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title="Add leave"
            width={480}
            destroyOnHidden
            styles={{ wrapper: { maxWidth: '100vw' } }}
            footer={
                <Flex justify="end" gap={8}>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="primary" loading={busy} onClick={save} data-hr-add-save>
                        Add leave
                    </Button>
                </Flex>
            }
        >
            <Flex vertical gap={14} data-hr-add-leave>
                <Flex vertical gap={4}>
                    <Text strong className="text-sm">
                        Employee
                    </Text>
                    <Select
                        showSearch
                        value={employeeId ?? undefined}
                        placeholder="Pick an employee"
                        optionFilterProp="label"
                        aria-label="Employee"
                        onChange={v => {
                            setEmployeeId(v);
                            setError('');
                        }}
                        options={people.map(p => ({ value: p.id, label: `${p.name} · ${p.department}` }))}
                    />
                </Flex>
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                    <Flex vertical gap={4}>
                        <Text strong className="text-sm">
                            Start date
                        </Text>
                        <DatePicker
                            value={from}
                            format={DATE_FORMATS}
                            aria-label="Start date"
                            onChange={d => {
                                setFrom(d);
                                if (d && (!to || to.isBefore(d, 'day'))) setTo(d);
                                setError('');
                            }}
                        />
                    </Flex>
                    <Flex vertical gap={4}>
                        <Text strong className="text-sm">
                            End date
                        </Text>
                        <DatePicker
                            value={to}
                            format={DATE_FORMATS}
                            aria-label="End date"
                            disabledDate={d => Boolean(from && d.isBefore(from, 'day'))}
                            onChange={d => {
                                setTo(d);
                                setError('');
                            }}
                        />
                    </Flex>
                </div>
                <div className="rounded-xl bg-[#F9FAFB] px-3 py-2" data-hr-duration>
                    {count && count.working > 0 ? (
                        <Text className="text-sm">
                            <b className="font-medium">{halfOf ? `${count.working} half day${count.working === 1 ? '' : 's'} = ${daysText(count.days)}` : daysText(count.days)}</b>
                            <span className="text-xs text-gray-500">
                                {count.sandwich ? ` · incl. ${count.sandwich} day${count.sandwich === 1 ? '' : 's'} off in between (sandwich rule)` : ' · weekly offs and public holidays aren’t counted'}
                            </span>
                        </Text>
                    ) : (
                        <Text type="secondary" className="text-xs">
                            {count ? 'Those dates are all weekly offs or public holidays.' : 'Pick the dates to see the duration.'}
                        </Text>
                    )}
                </div>
                {from && (
                    <Flex vertical gap={4}>
                        <Text strong className="text-sm">
                            Half days
                        </Text>
                        <Radio.Group
                            optionType="button"
                            value={half}
                            onChange={e => setHalf(e.target.value)}
                            aria-label="Half days"
                            options={[
                                { value: 'NONE', label: 'Full days' },
                                { value: 'FIRST', label: 'First half of each day' },
                                { value: 'SECOND', label: 'Second half of each day' },
                            ]}
                        />
                    </Flex>
                )}
                <Flex vertical gap={4}>
                    <Text strong className="text-sm">
                        Leave type
                    </Text>
                    <Select
                        value={type || undefined}
                        disabled={!info}
                        placeholder={employeeId ? 'Loading…' : 'Pick an employee first'}
                        aria-label="Leave type"
                        onChange={v => {
                            setType(v);
                            setError('');
                        }}
                        options={(info?.balances ?? []).map(x => ({ value: x.type, label: `${x.label} · ${x.notAvailable ? 'not available on probation' : `${fmtDays(x.available)} available`}` }))}
                    />
                    {b?.notAvailable && (
                        <Text className="text-xs !text-[#B54708]">
                            {b.label} isn’t available while {first} is on probation.
                        </Text>
                    )}
                </Flex>
                <Flex vertical gap={4}>
                    <Text strong className="text-sm">
                        Note
                    </Text>
                    <Input.TextArea
                        rows={3}
                        value={note}
                        aria-label="Note"
                        placeholder="e.g. Called in sick, confirmed by manager"
                        onChange={e => {
                            setNote(e.target.value);
                            setError('');
                        }}
                    />
                </Flex>
                <Flex vertical gap={4}>
                    <Text strong className="text-sm">
                        Attachment (optional)
                    </Text>
                    <Upload
                        maxCount={1}
                        accept="image/*,.pdf"
                        beforeUpload={file => {
                            setAttachment({ name: file.name });
                            return false;
                        }}
                        onRemove={() => setAttachment(null)}
                        fileList={attachment ? [{ uid: '1', name: attachment.name, status: 'done' }] : []}
                    >
                        <Button icon={<UploadOutlined />}>Attach a file</Button>
                    </Upload>
                </Flex>
                <Text type="secondary" className="text-xs">
                    Leave added by HR is approved straight away. The employee sees it in their leave list, and their attendance and timesheet update
                    automatically.
                </Text>
                {error && <Alert type="error" showIcon message={error} data-hr-add-error />}
                {from && dayjs(start).isBefore(dayjs(), 'day') && (
                    <Text type="secondary" className="text-xs">
                        This leave is in the past. It’s picked up by the next payroll.
                    </Text>
                )}
            </Flex>
        </Drawer>
    );
};

export default HrAddLeaveDrawer;
