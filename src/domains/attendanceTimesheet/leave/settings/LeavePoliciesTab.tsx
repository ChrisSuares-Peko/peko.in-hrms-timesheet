// PROTOTYPE-SETUP (Leave module): Payroll settings → Leave Policies, rebuilt as four sub-tabs (?leaveTab=).
//   Leave types ....... search, "Add leave type"; the table (Leave type + a small line, Number of days, Accrual type and
//                       rate, Leave balance carryover, Applicable gender, Action: View · Edit · Delete). Delete only for
//                       a type never used and never for Maternity (disabled with a tooltip); deactivating is "Show to
//                       employees" in the Edit drawer
//   Public holidays ... a dated list per year: add a date and a name, remove
//   Configuration ..... leave year (+ the automatic roll-forward), half-day leave, sandwich rule, comp off + expiry.
//                       Probation and pro-rating are fixed rules, not settings; the late check-in deduction is an
//                       attendance setting (Payroll settings → Attendance, timesheet & overtime, see AtsSettingsTab)
//   Approvals ......... Level 1 / Level 2 for leave (leave cancellations and comp off use the same approvers)
// Every type is paid: there's no unpaid option. Loss of pay only happens when a balance runs out.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { DeleteOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Card, DatePicker, Empty, Flex, Input, InputNumber, Popconfirm, Radio, Segmented, Select, Skeleton, Switch, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useSearchParams } from 'react-router-dom';

import InfoTip from '@src/components/peko/InfoTip';
import { PekoSectionTabs } from '@src/components/peko/PageHeader';
import StatusTag from '@src/components/peko/StatusTag';
import { useAppDispatch } from '@src/hooks/store';
import { useDevPage } from '@src/prototype/devNotes/devPage';
import { CREDIT_DATE_LABEL, LOP_RULE_LABEL, ROUNDING_LABEL, carryText, creditedText, daysText, entitlementText, isMaternity } from '@src/prototype/rules/leave';
import { showToast } from '@src/slices/apiSlice';

import { LeaveTypeDrawer, LeaveTypeView } from './LeaveTypeDrawer';
import { addLeaveType, addPublicHoliday, getLeaveSettings, removeLeaveType, removePublicHoliday, updateLeaveConfig, updateLeaveType } from '../../api';
import AtsSettingsTab from '../../payroll/AtsSettingsTab';
import { usePayrollScope } from '../../payroll/usePayrollAts';
import type { LeavePolicy, LeaveSettingsView, LeaveTypeConfig, LeaveTypeInput, SandwichConfig } from '../../types';

const { Text } = Typography;

type Sub = 'types' | 'holidays' | 'config' | 'approvals';

// ---- Leave types ----------------------------------------------------------------------------------------------

const USED_TIP = 'Already used in leave requests, so it can’t be deleted. Open Edit to deactivate it instead.';
/** "Monthly · 1 day a month" / "All at once · 8 days" / "Per event (no accrual)". */
const accrualColumn = (t: LeaveTypeConfig) => {
    if (t.kind === 'event') return 'Per event (no accrual)';
    return t.credit === 'CYCLE_START' ? `All at once · ${daysText(t.daysPerYear)}` : creditedText(t);
};
const MATERNITY_TIP = 'Maternity is statutory leave: it can’t be deleted.';
const GENDER_LABEL: Record<LeaveTypeConfig['appliesTo'], string> = { ALL: 'All', FEMALE: 'Female', MALE: 'Male' };

/** The small line under the name: Yearly balance / Per event / Statutory · required or optional / Inactive. */
const typeSubLine = (t: LeaveTypeConfig, view: LeaveSettingsView) => {
    let kind = t.kind === 'event' ? 'Per event' : 'Yearly balance';
    if (isMaternity(t)) {
        if (view.maternityRequired) kind = 'Statutory · required';
        else kind = `Statutory · optional${view.policy.matOn ? '' : ', not offered'}`;
    }
    return t.active ? kind : `${kind} · Inactive`;
};

type Editing = { type: LeaveTypeConfig | null } | null;

// PROTOTYPE-SETUP (Design update): the drawer state lives in the tab, so "Add leave type" can sit on the sub-tab row.
const LeaveTypes = ({
    view,
    onView,
    editing,
    setEditing,
}: {
    view: LeaveSettingsView;
    onView: (v: LeaveSettingsView | false, msg?: string) => boolean;
    editing: Editing;
    setEditing: (e: Editing) => void;
}) => {
    const scope = usePayrollScope();
    const [q, setQ] = useState('');
    const [viewing, setViewing] = useState<LeaveTypeConfig | null>(null);
    const used = (id: string) => (view.usage[id]?.requests ?? 0) > 0;
    const text = q.trim().toLowerCase();
    const rows = view.policy.types.filter(t => !text || t.name.toLowerCase().includes(text));
    const columns: ColumnsType<LeaveTypeConfig> = [
        // PROTOTYPE-SETUP (Leave settings rework): Leave type (a small line under it) · Number of days · Accrual type and
        // rate · Leave balance carryover · Applicable gender · Action.
        {
            title: 'Leave type',
            key: 'n',
            render: (_, t) => (
                <div className="flex flex-col" data-type-name={t.id}>
                    <Text className="font-medium">{t.name}</Text>
                    <Text type="secondary" className="text-xs" data-type-sub={t.id}>
                        {typeSubLine(t, view)}
                    </Text>
                </div>
            ),
        },
        { title: 'Number of days', key: 'd', render: (_, t) => <span className="block max-w-[170px] whitespace-normal" data-entitlement={t.id}>{entitlementText(t)}</span> },
        { title: 'Accrual type and rate', key: 'c', render: (_, t) => <span className="block max-w-[190px] whitespace-normal">{accrualColumn(t)}</span> },
        { title: 'Leave balance carryover', key: 'cf', render: (_, t) => (t.kind === 'event' ? 'No' : carryText(t)) },
        { title: 'Applicable gender', key: 'a', render: (_, t) => GENDER_LABEL[t.appliesTo] },
        {
            title: 'Action',
            key: 'x',
            render: (_, t) => (
                <Flex gap={4} wrap="nowrap" data-type-actions={t.id}>
                    <Button size="small" type="text" onClick={() => setViewing(t)} data-view-type={t.id}>
                        View
                    </Button>
                    <Button size="small" onClick={() => setEditing({ type: t })} data-edit-type={t.id}>
                        Edit
                    </Button>
                    {used(t.id) || isMaternity(t) ? (
                        <Tooltip title={isMaternity(t) ? MATERNITY_TIP : USED_TIP}>
                            {/* A disabled button swallows hover: the span carries the tooltip. */}
                            <span className="inline-block">
                                <Button size="small" type="text" danger disabled className="pointer-events-none" aria-label={`Delete ${t.name} (${isMaternity(t) ? MATERNITY_TIP : USED_TIP})`} data-delete-type={t.id}>
                                    Delete
                                </Button>
                            </span>
                        </Tooltip>
                    ) : (
                        <Popconfirm title={`Delete ${t.name}?`} description="It hasn’t been used, so nothing else changes." okText="Delete" onConfirm={async () => onView(await removeLeaveType(scope, t.id), `${t.name} deleted`)}>
                            <Button size="small" type="text" danger disabled={view.policy.types.length <= 1} data-delete-type={t.id}>
                                Delete
                            </Button>
                        </Popconfirm>
                    )}
                </Flex>
            ),
        },
    ];
    return (
        <Flex vertical gap={12} data-leave-types-tab>
            <Flex justify="space-between" align="flex-start" gap={12} wrap="wrap">
                <div className="min-w-0 flex-1 basis-[280px]">
                    <Text className="inline-flex items-center text-base font-semibold" data-types-title>
                        Leave types
                        <InfoTip
                            label="About leave types"
                            title={`These settings decide what employees see and can apply for in ESS. Yearly types build a balance; per-event types (maternity, paternity) give a number of days per event. All leave is paid: loss of pay is the only unpaid leave. A type that has been used can’t be deleted or renamed; to stop offering it, turn off “Show to employees”. ${view.migrationNote ?? ''}`}
                        />
                    </Text>
                </div>
                <div className="w-full sm:w-[240px]">
                    <Input allowClear prefix={<SearchOutlined />} placeholder="Search by name" aria-label="Search leave types" value={q} onChange={e => setQ(e.target.value)} />
                </div>
            </Flex>
            <div className="min-w-0 overflow-hidden rounded-lg border border-solid border-[var(--peko-border)] bg-white">
                <Table<LeaveTypeConfig>
                    rowKey="id"
                    columns={columns}
                    dataSource={rows}
                    pagination={false}
                    size="middle"
                    scroll={{ x: 'max-content' }}
                    rowClassName={t => (t.active ? '' : 'opacity-60')}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No leave types match. Try another name." /> }}
                    data-leave-types-table
                />
            </div>
            <LeaveTypeView
                type={viewing}
                requests={viewing ? view.usage[viewing.id]?.requests ?? 0 : 0}
                onClose={() => setViewing(null)}
                onEdit={() => {
                    setEditing({ type: viewing });
                    setViewing(null);
                }}
            />
            <LeaveTypeDrawer
                open={Boolean(editing)}
                type={editing?.type ?? null}
                used={editing?.type ? used(editing.type.id) : false}
                affected={editing?.type ? view.usage[editing.type.id]?.employees ?? 0 : 0}
                headcount={view.headcount}
                maternityRequired={view.maternityRequired}
                matOn={view.policy.matOn}
                onClose={() => setEditing(null)}
                onSave={async (input: LeaveTypeInput, extra?: { matOn?: boolean }) => {
                    if (extra && extra.matOn !== undefined && !view.maternityRequired && extra.matOn !== view.policy.matOn) {
                        const cfg = await updateLeaveConfig(scope, { matOn: extra.matOn });
                        if (!cfg) return false;
                    }
                    const res = editing?.type ? await updateLeaveType(scope, editing.type.id, input) : await addLeaveType(scope, input);
                    return onView(res, editing?.type ? `${input.name} updated` : `${input.name} added`);
                }}
            />
        </Flex>
    );
};

// ---- Public holidays ----------------------------------------------------------------------------------------

const Holidays = ({ view, onView }: { view: LeaveSettingsView; onView: (v: LeaveSettingsView | false, msg?: string) => boolean }) => {
    const scope = usePayrollScope();
    const thisYear = dayjs().year();
    const [year, setYear] = useState(String(thisYear));
    const [date, setDate] = useState<Dayjs | null>(null);
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const weekend = (d: string) => [0, 6].includes(dayjs(d).day());
    const inYear = view.holidays.filter(h => h.date.slice(0, 4) === year);
    const add = async () => {
        if (!date) return setError('Pick a date.');
        if (!name.trim()) return setError('Add the holiday’s name.');
        const iso = date.format('YYYY-MM-DD');
        if (view.holidays.some(h => h.date === iso)) return setError('There’s already a holiday on that date.');
        if (onView(await addPublicHoliday(scope, { date: iso, name: name.trim() }), `${name.trim()} added`)) {
            setDate(null);
            setName('');
            setError('');
            setYear(iso.slice(0, 4));
        }
        return undefined;
    };
    return (
        <Flex vertical gap={12} data-holidays-tab>
            <Flex justify="space-between" align="flex-start" gap={12} wrap="wrap">
                <div className="min-w-0 flex-1 basis-[280px]">
                    <Text className="block text-base font-medium">Public holidays</Text>
                    <Text type="secondary" className="text-xs">
                        Office-wide days off. They show in every calendar, fill the timesheet for the shift, aren’t counted as leave days, and decide comp off.
                    </Text>
                </div>
                <Segmented value={year} onChange={v => setYear(String(v))} options={[thisYear - 1, thisYear, thisYear + 1].map(y => ({ value: String(y), label: String(y) }))} aria-label="Year" />
            </Flex>
            <Flex gap={8} wrap="wrap">
                <DatePicker value={date} onChange={setDate} format="D MMM YYYY" aria-label="Holiday date" className="w-full sm:w-[180px]" />
                <Input
                    value={name}
                    onChange={e => {
                        setName(e.target.value);
                        setError('');
                    }}
                    onPressEnter={add}
                    placeholder="Holiday name, e.g. Diwali"
                    aria-label="Holiday name"
                    className="w-full sm:flex-1"
                    maxLength={60}
                />
                <Button type="primary" icon={<PlusOutlined />} onClick={add} data-add-holiday>
                    Add holiday
                </Button>
            </Flex>
            {error && <Alert type="error" showIcon message={error} />}
            <div className="min-w-0 overflow-hidden rounded-lg border border-solid border-[var(--peko-border)] bg-white">
                <Table
                    rowKey="date"
                    size="middle"
                    pagination={false}
                    dataSource={inYear}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No holidays for ${year}. Add the year’s public holidays above.`} /> }}
                    columns={[
                        { title: 'Date', key: 'd', render: (_, h) => dayjs(h.date).format('D MMM YYYY') },
                        {
                            title: 'Day',
                            key: 'w',
                            render: (_, h) => (
                                <span>
                                    {dayjs(h.date).format('dddd')}
                                    {weekend(h.date) && <StatusTag tone="leave" className="!ml-2">Weekly off</StatusTag>}
                                </span>
                            ),
                        },
                        { title: 'Holiday', key: 'n', render: (_, h) => <Text className="font-medium">{h.name}</Text> },
                        {
                            title: '',
                            key: 'x',
                            render: (_, h) => (
                                <Button size="small" type="text" icon={<DeleteOutlined />} onClick={async () => onView(await removePublicHoliday(scope, h.date), `${h.name} removed`)} aria-label={`Remove ${h.name}`}>
                                    Remove
                                </Button>
                            ),
                        },
                    ]}
                />
            </div>
            <Text type="secondary" className="text-xs">
                {inYear.length} holiday{inYear.length === 1 ? '' : 's'} in {year} · {inYear.filter(h => !weekend(h.date)).length} on working days. A holiday on a weekly
                off doesn’t give an extra day off.
            </Text>
        </Flex>
    );
};

// ---- Configuration ------------------------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Config {
    year: LeavePolicy['year'];
    day: number;
    month: number;
    halfDay: boolean;
    sandwich: SandwichConfig;
    compOn: boolean;
    expiry: number;
    // PROTOTYPE-SETUP (Leave policy settings): credit date, rounding, loss of pay.
    creditDate: LeavePolicy['creditDate'];
    creditDay: number;
    rounding: LeavePolicy['rounding'];
    lop: LeavePolicy['lop'];
}

const configOf = (v: LeaveSettingsView): Config => ({
    year: v.policy.year,
    day: Number(v.policy.cycleStart.slice(3)),
    month: Number(v.policy.cycleStart.slice(0, 2)),
    halfDay: v.halfDay,
    sandwich: v.policy.sandwich,
    compOn: v.policy.compOff.enabled,
    expiry: v.policy.compOff.expiryDays,
    creditDate: v.policy.creditDate,
    creditDay: v.policy.creditDay,
    rounding: v.policy.rounding,
    lop: v.policy.lop,
});

const Configuration = ({ view, onView }: { view: LeaveSettingsView; onView: (v: LeaveSettingsView | false, msg?: string) => boolean }) => {
    const scope = usePayrollScope();
    const [c, setC] = useState<Config>(() => configOf(view));
    const [busy, setBusy] = useState(false);
    useEffect(() => setC(configOf(view)), [view]);
    const set = <K extends keyof Config>(k: K, v: Config[K]) => setC(cur => ({ ...cur, [k]: v }));
    const dirty = JSON.stringify(c) !== JSON.stringify(configOf(view));
    const save = async () => {
        setBusy(true);
        const res = await updateLeaveConfig(scope, {
            year: c.year,
            cycleStart: `${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`,
            halfDay: c.halfDay,
            sandwich: c.sandwich,
            compOff: { enabled: c.compOn, expiryDays: c.expiry },
            creditDate: c.creditDate,
            creditDay: c.creditDay,
            rounding: c.rounding,
            lop: c.lop,
        });
        setBusy(false);
        onView(res, 'Leave configuration saved.');
    };
    return (
        <Flex vertical gap={14} data-leave-config>
            <Card title="Leave year" size="small">
                <Text type="secondary" className="mb-3 block text-xs">
                    When balances reset and unused leave carries forward or lapses.
                </Text>
                <Radio.Group
                    optionType="button"
                    value={c.year}
                    onChange={e => set('year', e.target.value)}
                    aria-label="Leave year"
                    options={[
                        { value: 'COMPANY', label: 'Company leave cycle' },
                        { value: 'JOINING', label: 'Each employee’s joining date' },
                    ]}
                />
                {c.year === 'COMPANY' ? (
                    <Flex align="center" gap={8} wrap="wrap" className="mt-3">
                        <Text className="text-sm">Starts on</Text>
                        <InputNumber min={1} max={28} value={c.day} onChange={n => set('day', Number(n ?? 1))} className="!w-[72px]" aria-label="Start day" />
                        <Select value={c.month} onChange={m => set('month', m)} options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} className="!w-[140px]" aria-label="Start month" />
                        <Text type="secondary" className="text-xs">
                            Everyone’s leave resets the day before.
                        </Text>
                    </Flex>
                ) : (
                    <Text type="secondary" className="mt-3 block text-xs">
                        Each employee’s leave resets on their joining anniversary.
                    </Text>
                )}
                <Text type="secondary" className="mt-3 block text-xs" data-roll-forward>
                    Balances roll forward automatically on the last working day of each leave cycle
                    {view.nextRollForward && view.policy.year === 'COMPANY' ? ` (next: ${dayjs(view.nextRollForward).format('ddd D MMM YYYY')})` : ''}: unused days follow
                    each type’s year-end rule (carry forward up to its limit, encash, or lapse). Nothing to run by hand.
                </Text>
            </Card>
            <Card title="Credit date" size="small" data-config-credit-date>
                <Text type="secondary" className="mb-3 block text-xs">
                    When monthly credits land. End of the month = earned once the month is worked. A joiner’s first credit lands on this date in their first
                    counted month.
                </Text>
                <Flex align="center" gap={8} wrap="wrap">
                    <Radio.Group
                        optionType="button"
                        value={c.creditDate}
                        onChange={e => set('creditDate', e.target.value)}
                        aria-label="Credit date"
                        options={(['START', 'END', 'CUSTOM'] as const).map(v => ({ value: v, label: CREDIT_DATE_LABEL[v] }))}
                    />
                    {c.creditDate === 'CUSTOM' && (
                        <Flex align="center" gap={8}>
                            <Text className="text-sm">Day</Text>
                            <InputNumber min={1} max={28} value={c.creditDay} onChange={n => set('creditDay', Number(n ?? 1))} className="!w-[72px]" aria-label="Credit day" data-credit-day />
                            <Text type="secondary" className="text-xs">
                                of each month (1–28)
                            </Text>
                        </Flex>
                    )}
                </Flex>
            </Card>
            <Card title="Rounding" size="small" data-config-rounding>
                <Text type="secondary" className="mb-3 block text-xs">
                    Applied to credited-so-far and the year’s total. Example: 14 days a year is 1.167 a month; with “Nearest half day” the balance reads 1, 2.5,
                    3.5 …
                </Text>
                <Radio.Group
                    optionType="button"
                    value={c.rounding}
                    onChange={e => set('rounding', e.target.value)}
                    aria-label="Rounding"
                    options={(['NONE', 'HALF', 'DAY'] as const).map(v => ({ value: v, label: ROUNDING_LABEL[v] }))}
                />
            </Card>
            <Card title="Leave requests" size="small">
                <Flex align="center" gap={12}>
                    <div className="min-w-0 flex-1">
                        <Text strong className="block">
                            Half-day leave
                        </Text>
                        <Text type="secondary" className="text-xs">
                            Employees pick the first or second half of each day in the range.
                        </Text>
                    </div>
                    <Switch checked={c.halfDay} onChange={v => set('halfDay', v)} aria-label="Half-day leave" />
                </Flex>
            </Card>
            <Card title="Loss of pay (unpaid leave)" size="small" data-config-lop>
                <Text type="secondary" className="mb-3 block text-xs">
                    When employees can request loss of pay (ESS → Leave → Request LOP). “Used up” means every yearly balance and comp off is at 0; per-event leave
                    doesn’t count. Loss of pay has no limit and follows the leave approvers.
                </Text>
                <Radio.Group
                    value={c.lop}
                    onChange={e => set('lop', e.target.value)}
                    aria-label="Loss of pay"
                    className="flex flex-col gap-1.5"
                    options={(['USED_UP', 'ANY_TIME'] as const).map(v => ({ value: v, label: LOP_RULE_LABEL[v] }))}
                />
            </Card>
            <Card title="Sandwich rule" size="small">
                <Text type="secondary" className="mb-3 block text-xs">
                    Whether days off that fall between two leave days in the same request count as leave. Example: leave on Friday and Monday covers Saturday and
                    Sunday too.
                </Text>
                <Radio.Group
                    optionType="button"
                    value={c.sandwich}
                    onChange={e => set('sandwich', e.target.value)}
                    aria-label="Sandwich rule"
                    options={[
                        { value: 'OFF', label: 'Off' },
                        { value: 'WEEKLY_OFFS', label: 'Weekly offs count' },
                        { value: 'WEEKLY_OFFS_AND_HOLIDAYS', label: 'Weekly offs and holidays count' },
                    ]}
                />
                <Text type="secondary" className="mt-2 block text-xs">
                    Applies to new requests. Days off at the start or end of a request never count, and half-day requests aren’t affected.
                </Text>
            </Card>
            <Card title="Comp off" size="small">
                <Flex align="center" gap={12}>
                    <Text type="secondary" className="min-w-0 flex-1 text-xs">
                        Employees who work on a weekly off or public holiday can claim a day off for it. Half a shift or more earns half a day, a full shift earns a
                        full day. Requests follow the leave approvers.
                    </Text>
                    <Switch checked={c.compOn} onChange={v => set('compOn', v)} aria-label="Comp off" />
                </Flex>
                {c.compOn && (
                    <Flex align="center" gap={8} wrap="wrap" className="mt-3">
                        <Text className="text-sm">Comp off expires after</Text>
                        <InputNumber min={0} max={365} value={c.expiry} onChange={n => set('expiry', Number(n ?? 0))} className="!w-[80px]" aria-label="Comp off expires after" />
                        <Text type="secondary" className="text-xs">
                            days (0 = never). A day can be claimed as overtime or comp off, not both.
                        </Text>
                    </Flex>
                )}
            </Card>
            <Flex justify="end" gap={8} wrap="wrap">
                <Button onClick={() => setC(configOf(view))} disabled={!dirty || busy}>
                    Discard changes
                </Button>
                <Button type="primary" loading={busy} disabled={!dirty} onClick={save} data-save-config>
                    Save settings
                </Button>
            </Flex>
        </Flex>
    );
};

// ---- the tab ------------------------------------------------------------------------------------------------

const LeavePoliciesTab = () => {
    const scope = usePayrollScope();
    const dispatch = useAppDispatch();
    const [params, setParams] = useSearchParams();
    const [view, setView] = useState<LeaveSettingsView | null>(null);
    const [failed, setFailed] = useState(false);
    const sub = useMemo(() => {
        const t = params.get('leaveTab') as Sub | null;
        return t && ['types', 'holidays', 'config', 'approvals'].includes(t) ? t : 'types';
    }, [params]);
    // PROTOTYPE-SETUP (Developer notes): Leave types · Public holidays · Configuration · Approvals.
    useDevPage(`pay:settings:leave:${sub}`);
    const load = useCallback(async () => {
        const res = await getLeaveSettings(scope);
        if (res) setView(res);
        else setFailed(true);
    }, [scope]);
    useEffect(() => {
        load();
    }, [load]);
    const onView = (next: LeaveSettingsView | false, message?: string) => {
        if (!next) return false;
        setView(next);
        if (message) dispatch(showToast({ variant: 'success', description: message }));
        return true;
    };
    const [editing, setEditing] = useState<Editing>(null);
    if (!view) return failed ? <Alert type="error" showIcon message="Couldn’t load the leave policies. Refresh the page to try again." /> : <Skeleton active paragraph={{ rows: 8 }} />;
    return (
        <Flex vertical gap={16} className="w-full min-w-0" data-leave-policies>
            {/* PROTOTYPE-SETUP (Peko One): the Leave sub-sections are underline tabs; "Add leave type" on the tab bar. */}
            <PekoSectionTabs<Sub>
                value={sub}
                className="mb-1"
                onChange={v => {
                    const next = new URLSearchParams(params);
                    next.set('leaveTab', v);
                    setParams(next, { replace: true });
                }}
                items={[
                    { value: 'types', label: 'Leave types' },
                    { value: 'holidays', label: 'Public holidays' },
                    { value: 'config', label: 'Configuration' },
                    { value: 'approvals', label: 'Approvals' },
                ]}
                actions={
                    sub === 'types' && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ type: null })} data-add-type>
                            Add leave type
                        </Button>
                    )
                }
                data-leave-policy-subtabs
            />
            {sub === 'types' && <LeaveTypes view={view} onView={onView} editing={editing} setEditing={setEditing} />}
            {sub === 'holidays' && <Holidays view={view} onView={onView} />}
            {sub === 'config' && <Configuration view={view} onView={onView} />}
            {sub === 'approvals' && <AtsSettingsTab section="leave" />}
        </Flex>
    );
};

export default LeavePoliciesTab;
