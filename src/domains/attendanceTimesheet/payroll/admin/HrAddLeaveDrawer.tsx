// PROTOTYPE-SETUP (Leave module): Payroll → Leave → "Add leave" (HR adds leave for an employee).
//   Employee, Leave type (with what's available for them), Start date, End date → the duration worked out, Full days
//   or the first / second half of each day, Note, an optional attachment. The same checks as the employee's form
//   (overlap, balance, probation); approved straight away and marked "Added by HR"; their attendance and timesheet
//   update at once.
// PROTOTYPE-SETUP (Leave settings rework): the same rules as ESS Apply — half days only for types that allow them;
// per-event types (paternity, maternity, …) ask for the event date first, limit the start to the window, fill the end
// for the full entitlement (it can be shortened, not extended); Maternity also asks which child it is.
import { useEffect, useMemo, useState } from 'react';

import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, DatePicker, Drawer, Flex, Input, Radio, Select, Typography, Upload } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';

import InfoTip from '@src/components/peko/InfoTip';
import { useAppDispatch } from '@src/hooks/store';
import { RuleError } from '@src/prototype/rules/attendance';
import {
    COUNT_LABEL,
    MATERNITY_CHILD_LABEL,
    autoEnd,
    countLeaveDays,
    daysText,
    eventDateLabel,
    eventEntitlement,
    eventWindow,
    fmtDays,
    isMaternity,
    startRange,
    startRangeText,
    typeLabel,
    validateLeave,
    windowText,
} from '@src/prototype/rules/leave';
import { showToast } from '@src/slices/apiSlice';

import { getAdminPeople, getEmployeeLeaveTypes, hrAddLeave } from '../../api';
import { DATE_FORMATS, calendarFrom, typeOf } from '../../leave/ApplyLeaveModal';
import type { LeaveHalf, MaternityChild, PersonRef } from '../../types';
import { usePayrollScope } from '../usePayrollAts';

const { Text } = Typography;

type Info = Exclude<Awaited<ReturnType<typeof getEmployeeLeaveTypes>>, false>;
const iso = (d: Dayjs | null) => (d ? d.format('YYYY-MM-DD') : '');
const MON_FRI = { weeklyOff: ['SATURDAY', 'SUNDAY'] as const, isHoliday: () => false };

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
    const [eventDate, setEventDate] = useState<Dayjs | null>(null);
    const [child, setChild] = useState<MaternityChild | null>(null);
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
        setEventDate(null);
        setChild(null);
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
            const ids = [...res.balances.map(b => b.type), ...(res.eventTypes ?? []).map(t => t.id)];
            setType(t => (ids.includes(t) ? t : res.balances.find(b => b.type === 'ANNUAL')?.type ?? res.balances[0]?.type ?? ''));
        });
    }, [employeeId, scope]);

    const cal = useMemo(() => (info ? calendarFrom(info.calendar) : null), [info]);
    const workCal = cal ?? { ...MON_FRI, weeklyOff: [...MON_FRI.weeklyOff] };
    const eventTypes = info?.eventTypes ?? [];
    const ev = eventTypes.find(t => t.id === type) ?? null;
    const b = info?.balances.find(x => x.type === type);
    const maternity = isMaternity(ev);
    const halfAllowed = !ev && b?.halfDay !== false;
    const start = iso(from);
    const end = iso(to) || start;
    const halfOf = halfAllowed && half !== 'NONE' ? half : null;
    const eventIso = iso(eventDate);
    const entitlement = ev ? eventEntitlement(ev, child) : 0;
    const range = ev && eventIso ? startRange(eventWindow(ev, child), eventIso) : null;
    const maxEnd = ev && start ? autoEnd(start, entitlement, ev.count, workCal) : null;
    const dateLabel = ev ? eventDateLabel(ev) : '';
    // Without an employee yet, count against the company's Monday–Friday week (it's recounted once one is picked).
    const count = start && end >= start ? countLeaveDays(start, end, halfOf, workCal, ev ? 'OFF' : info?.rules.sandwich ?? 'OFF', ev?.count ?? 'working') : null;
    const person = people.find(p => p.id === employeeId);
    const first = person?.name.split(' ')[0] ?? '';

    const fillEnd = (s0: string, days: number) => {
        if (ev && s0) setTo(dayjs(autoEnd(s0, days, ev.count, workCal)));
    };
    const outsideRange = (d: Dayjs) => {
        if (!range) return true;
        const x = d.format('YYYY-MM-DD');
        return Boolean((range.from && x < range.from) || (range.to && x > range.to));
    };
    const pickType = (v: string) => {
        const nowEvent = eventTypes.some(t => t.id === v);
        setType(v);
        setError('');
        setEventDate(null);
        setChild(null);
        if (nowEvent || ev) {
            setFrom(null);
            setTo(null);
        }
        if (nowEvent || info?.balances.find(x => x.type === v)?.halfDay === false) setHalf('NONE');
    };

    const save = async () => {
        if (!employeeId || !info || !cal) return setError('Pick an employee.');
        if (ev && !eventIso) return setError(`Add the ${dateLabel.toLowerCase()}.`);
        if (!start || !iso(to)) return setError('Pick the start and end dates.');
        try {
            validateLeave(
                { type, start, end, half: halfOf, reason: note, proof: attachment, eventDate: eventIso || null, child: maternity ? child : null },
                {
                    types: [...info.balances.map(typeOf), ...eventTypes],
                    cal,
                    sandwich: info.rules.sandwich,
                    halfDayAllowed: true,
                    existing: info.existing,
                    available: Object.fromEntries(info.balances.map(x => [x.type, x.available])),
                    pending: Object.fromEntries(info.balances.map(x => [x.type, x.inRequest])),
                    onProbation: info.status === 'PROBATION',
                    eventTaken: (t: string, date: string) => (info.events ?? []).some(x => x.type === t && x.eventDate === date),
                    who: first,
                    reasonMessage: 'Add a short note.',
                }
            );
        } catch (e) {
            if (e instanceof RuleError) return setError(e.message);
            throw e;
        }
        setBusy(true);
        const res = await hrAddLeave(scope, { employeeId, type, start, end, half: halfOf, note: note.trim(), attachment, ...(ev ? { eventDate: eventIso } : {}), ...(maternity ? { child } : {}) });
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
            title={
                <span className="inline-flex items-center">
                    Add leave
                    <InfoTip
                        label="About adding leave"
                        title="Leave added by HR is approved straight away. The employee sees it in their leave list, and their attendance and timesheet update automatically. Past leave is picked up by the next payroll."
                    />
                </span>
            }
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
                    <Text className="text-sm">Employee</Text>
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
                <Flex vertical gap={4}>
                    <Text className="text-sm">Leave type</Text>
                    <Select
                        value={type || undefined}
                        disabled={!info}
                        placeholder={employeeId ? 'Loading…' : 'Pick an employee first'}
                        aria-label="Leave type"
                        onChange={pickType}
                        data-hr-leave-type
                        options={[
                            ...(info?.balances ?? []).map(x => ({ value: x.type, label: `${x.label} · ${x.notAvailable ? 'not available on probation' : `${fmtDays(x.available)} available`}` })),
                            ...eventTypes.map(t => ({ value: t.id, label: `${typeLabel(t.name)} · per event` })),
                        ]}
                    />
                    {b?.notAvailable && (
                        <Text className="text-xs !text-[var(--peko-warning-ink)]">
                            {b.label} isn’t available while {first} is on probation.
                        </Text>
                    )}
                    {ev && (
                        <div className="flex items-center rounded-lg bg-[var(--peko-subtle)] px-3 py-2" data-hr-event-line>
                            <Text className="text-sm">
                                <b className="font-medium">{maternity && !child ? 'Days depend on the child' : `${daysText(entitlement)} for this event`}</b>
                                <span className="text-[var(--peko-muted)]"> · {COUNT_LABEL[ev.count].toLowerCase()}</span>
                            </Text>
                            <InfoTip label={`About ${typeLabel(ev.name)}`} title={`One request per event, taken in one go. ${windowText(ev, child)}.`} />
                        </div>
                    )}
                </Flex>
                {ev && (
                    <Flex vertical gap={4} data-hr-event-date-field>
                        <Text className="text-sm">{dateLabel}</Text>
                        <DatePicker
                            value={eventDate}
                            format={DATE_FORMATS}
                            aria-label={dateLabel}
                            onChange={d => {
                                setEventDate(d);
                                setError('');
                                if (!d) {
                                    setFrom(null);
                                    setTo(null);
                                    return;
                                }
                                const s0 = d.format('YYYY-MM-DD');
                                const r = startRange(eventWindow(ev, child), s0);
                                const firstDay = r.from && s0 < r.from ? r.from : s0;
                                setFrom(dayjs(firstDay));
                                fillEnd(firstDay, eventEntitlement(ev, child));
                            }}
                            data-hr-event-date
                        />
                    </Flex>
                )}
                {maternity && (
                    <Flex vertical gap={4} data-hr-child-field>
                        <Text className="text-sm">Which child is this?</Text>
                        <Radio.Group
                            optionType="button"
                            value={child}
                            aria-label="Which child is this?"
                            onChange={e => {
                                const c = e.target.value as MaternityChild;
                                setChild(c);
                                setError('');
                                if (eventIso && ev) {
                                    const r = startRange(eventWindow(ev, c), eventIso);
                                    let s0 = start || eventIso;
                                    if (r.from && s0 < r.from) s0 = r.from;
                                    if (r.to && s0 > r.to) s0 = r.to;
                                    setFrom(dayjs(s0));
                                    fillEnd(s0, eventEntitlement(ev, c));
                                }
                            }}
                            options={([1, 2, 3] as const).map(c => ({ value: c, label: c === 3 ? 'Third or later' : MATERNITY_CHILD_LABEL[c].replace(' child', '') }))}
                        />
                    </Flex>
                )}
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                    <Flex vertical gap={4}>
                        <Text className="text-sm">Start date</Text>
                        <DatePicker
                            value={from}
                            format={DATE_FORMATS}
                            aria-label="Start date"
                            disabled={Boolean(ev) && !eventDate}
                            disabledDate={ev ? outsideRange : undefined}
                            placeholder={ev && !eventDate ? `Add the ${dateLabel.toLowerCase()} first` : undefined}
                            onChange={d => {
                                setFrom(d);
                                setError('');
                                if (ev && d) fillEnd(d.format('YYYY-MM-DD'), entitlement);
                                else if (d && (!to || to.isBefore(d, 'day'))) setTo(d);
                            }}
                            data-hr-from
                        />
                    </Flex>
                    <Flex vertical gap={4}>
                        <Text className="text-sm">End date</Text>
                        <DatePicker
                            value={to}
                            format={DATE_FORMATS}
                            aria-label="End date"
                            disabled={Boolean(ev) && !from}
                            disabledDate={d => Boolean((from && d.isBefore(from, 'day')) || (maxEnd && d.format('YYYY-MM-DD') > maxEnd))}
                            onChange={d => {
                                setTo(d);
                                setError('');
                            }}
                            data-hr-to
                        />
                    </Flex>
                </div>
                {range && (
                    <Text type="secondary" className="-mt-2 text-xs" data-hr-start-range>
                        {startRangeText(range)}
                        {maxEnd ? ` · ends ${dayjs(maxEnd).format('ddd D MMM')} at the latest` : ''}
                    </Text>
                )}
                <div className="rounded-lg bg-[var(--peko-subtle)] px-3 py-2" data-hr-duration>
                    {count && count.working > 0 ? (
                        <Text className="text-sm">
                            <b className="font-medium">{halfOf ? `${count.working} half day${count.working === 1 ? '' : 's'} = ${daysText(count.days)}` : daysText(count.days)}</b>
                            {count.sandwich ? <span className="text-xs text-[var(--peko-muted)]"> · incl. {daysText(count.sandwich)} off in between (sandwich rule)</span> : null}
                        </Text>
                    ) : (
                        <Text type="secondary" className="text-xs">
                            {count ? 'Those dates are all weekly offs or public holidays.' : 'Pick the dates to see the duration.'}
                        </Text>
                    )}
                </div>
                {from && halfAllowed && (
                    <Flex vertical gap={4} data-hr-half-field>
                        <Text className="text-sm">Half days</Text>
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
                    <Text className="text-sm">Note</Text>
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
                    <Text className="text-sm">{ev?.docRequired ? `Supporting document${ev.docName ? ` (${ev.docName})` : ''}` : 'Attachment (optional)'}</Text>
                    <Upload
                        maxCount={1}
                        accept="image/*,.pdf"
                        beforeUpload={file => {
                            setAttachment({ name: file.name });
                            setError('');
                            return false;
                        }}
                        onRemove={() => setAttachment(null)}
                        fileList={attachment ? [{ uid: '1', name: attachment.name, status: 'done' }] : []}
                    >
                        <Button icon={<UploadOutlined />}>Attach a file</Button>
                    </Upload>
                </Flex>
                {error && <Alert type="error" showIcon message={error} data-hr-add-error />}
            </Flex>
        </Drawer>
    );
};

export default HrAddLeaveDrawer;
