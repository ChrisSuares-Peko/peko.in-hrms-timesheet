// PROTOTYPE-SETUP (Leave module): Payroll settings → Leave Policies, rebuilt as four sub-tabs (?leaveTab=).
//   Leave types ....... search, "Add leave type"; the table (Leave type + a small line, Number of days, Accrual type and
//                       rate, Leave balance carryover, Applicable gender, Action: View · Edit · Delete). Delete only for
//                       a type never used and never for Maternity (disabled with a tooltip); deactivating is "Show to
//                       employees" in the Edit drawer
//   Public holidays ... per year, consecutive same-name dates grouped (ranges); Add holiday / Edit (HolidayEditModal),
//                       Remove (confirmed); "Bulk upload" (HolidayUploadModal)
//   Configuration ..... credit date, rounding, leave year (+ the automatic roll-forward), loss of pay, sandwich rule,
//                       comp off + expiry (half days are per leave type now).
//                       Probation and pro-rating are fixed rules, not settings; the late check-in deduction is an
//                       attendance setting (Payroll settings → Attendance, timesheet & overtime, see AtsSettingsTab)
//   Approvals ......... Level 1 / Level 2 for leave (leave cancellations and comp off use the same approvers)
// Every type is paid: there's no unpaid option. Loss of pay only happens when a balance runs out.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { DeleteOutlined, PlusOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Checkbox, Empty, Flex, Input, InputNumber, Radio, Segmented, Select, Skeleton, Switch, Table, TimePicker, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useSearchParams } from 'react-router-dom';

import ConfirmDialog from '@src/components/peko/ConfirmDialog';
import InfoTip from '@src/components/peko/InfoTip';
import { PekoSectionTabs } from '@src/components/peko/PageHeader';
import StatusTag from '@src/components/peko/StatusTag';
import { useAppDispatch } from '@src/hooks/store';
import { useDevPage } from '@src/prototype/devNotes/devPage';
import { holidayGroups, type HolidayGroup } from '@src/prototype/rules/holidayImport';
import { CREDIT_DATE_LABEL, LOP_RULE_LABEL, ROUNDING_LABEL, carryText, creditDateCards, creditedText, daysText, entitlementText, isMaternity, sandwichExample } from '@src/prototype/rules/leave';
import { showToast } from '@src/slices/apiSlice';

import HolidayEditModal from './HolidayEditModal';
import HolidayUploadModal from './HolidayUploadModal';
import { LeaveTypeDrawer, LeaveTypeView } from './LeaveTypeDrawer';
import { addLeaveType, addPublicHoliday, getLeaveSettings, removeLeaveType, removePublicHoliday, setLeaveTypeActive, updateLeaveConfig, updateLeaveType, updatePublicHoliday } from '../../api';
import AtsSettingsTab from '../../payroll/AtsSettingsTab';
import { usePayrollScope } from '../../payroll/usePayrollAts';
import type { LeavePolicy, LeaveSettingsView, LeaveTypeConfig, LeaveTypeInput, SandwichConfig } from '../../types';

const { Text } = Typography;

type Sub = 'types' | 'holidays' | 'config' | 'approvals';

// ---- Leave types ----------------------------------------------------------------------------------------------

const USED_TIP = 'Already used in leave requests, so it can’t be deleted. Open Edit to disable it instead.';
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
    const [deleting, setDeleting] = useState<LeaveTypeConfig | null>(null);
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
                        <Button size="small" type="text" danger disabled={view.policy.types.length <= 1} onClick={() => setDeleting(t)} data-delete-type={t.id}>
                            Delete
                        </Button>
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
                            title={`These settings decide what employees see and can apply for in ESS. Yearly types build a balance; per-event types (maternity, paternity) give a number of days per event. All leave is paid: loss of pay is the only unpaid leave. A type that has been used can’t be deleted or renamed; to stop offering it, open Edit and disable it. ${view.migrationNote ?? ''}`}
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
            {/* PROTOTYPE-SETUP (Leave fixes): Delete asks for confirmation. */}
            <ConfirmDialog
                open={Boolean(deleting)}
                title={`Delete ${deleting?.name ?? ''}?`}
                confirm="Delete leave type"
                onClose={() => setDeleting(null)}
                onConfirm={async () => deleting && onView(await removeLeaveType(scope, deleting.id), `${deleting.name} deleted`)}
                data-delete-type-confirm
            >
                {deleting &&
                    `${deleting.name} will be removed for every employee. It hasn’t been used yet, so no history is lost. This can’t be undone; to stop offering a type you might use again, disable it instead.`}
            </ConfirmDialog>
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
                onSave={async (input: LeaveTypeInput) => {
                    const res = editing?.type ? await updateLeaveType(scope, editing.type.id, input) : await addLeaveType(scope, input);
                    return onView(res, editing?.type ? `${input.name} updated` : `${input.name} added`);
                }}
                // PROTOTYPE-SETUP (Leave fixes): Disable / Enable leave type, straight away (Maternity: offered or not).
                onToggle={async () => {
                    const t = editing?.type;
                    if (!t) return false;
                    const on = isMaternity(t) ? !view.policy.matOn : t.active === false;
                    const res = isMaternity(t) ? await updateLeaveConfig(scope, { matOn: on }) : await setLeaveTypeActive(scope, t.id, on);
                    return onView(res, on ? `${t.name} enabled. Employees can see and apply for it again.` : `${t.name} disabled. Employees won’t see it; balances and past leave stay.`);
                }}
            />
        </Flex>
    );
};

// ---- Public holidays ----------------------------------------------------------------------------------------

// PROTOTYPE-SETUP (Leave fixes — notes pay:settings:leave:holidays → "Holidays with ranges"): the table groups
// consecutive dates with the same name (Holiday · Date · Days · Action: Edit, Remove). Add holiday / Edit open a popup
// (HolidayEditModal); Remove asks for confirmation. Stored per date.
const Holidays = ({ view, onView }: { view: LeaveSettingsView; onView: (v: LeaveSettingsView | false, msg?: string) => boolean }) => {
    const scope = usePayrollScope();
    const thisYear = dayjs().year();
    const [year, setYear] = useState(String(thisYear));
    const [uploading, setUploading] = useState(false);
    const [editing, setEditing] = useState<HolidayGroup | 'new' | null>(null);
    const [removing, setRemoving] = useState<HolidayGroup | null>(null);
    const weekend = (d: string) => [0, 6].includes(dayjs(d).day());
    const groups = holidayGroups(view.holidays).filter(g => g.from.slice(0, 4) === year || g.to.slice(0, 4) === year);
    const days = groups.reduce((n, g) => n + g.days, 0);
    const working = view.holidays.filter(h => h.date.slice(0, 4) === year && !weekend(h.date)).length;
    const dateText = (g: HolidayGroup) =>
        g.days === 1 ? dayjs(g.from).format('ddd, D MMM YYYY') : `${dayjs(g.from).format('ddd, D MMM')} – ${dayjs(g.to).format('ddd, D MMM YYYY')}`;
    return (
        <Flex vertical gap={12} data-holidays-tab>
            <Flex justify="space-between" align="center" gap={12} wrap="wrap">
                <div className="min-w-0 flex-1 basis-[220px]">
                    <Text className="inline-flex items-center text-base font-semibold" data-holidays-title>
                        Public holidays
                        <InfoTip
                            label="About public holidays"
                            title="Office-wide days off. They show in every calendar, fill the timesheet for the shift, aren’t counted as leave days, and decide comp off. A holiday on a weekly off doesn’t give an extra day off. A holiday can be one day or a range (e.g. Diwali, 3 days)."
                        />
                    </Text>
                </div>
                <Flex gap={8} wrap="wrap" align="center">
                    <Segmented value={year} onChange={v => setYear(String(v))} options={[thisYear - 1, thisYear, thisYear + 1].map(y => ({ value: String(y), label: String(y) }))} aria-label="Year" />
                    {/* PROTOTYPE-SETUP (Leave settings rework): "Bulk upload" next to Add holiday. */}
                    <Button icon={<UploadOutlined />} onClick={() => setUploading(true)} data-bulk-holidays>
                        Bulk upload
                    </Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')} data-add-holiday>
                        Add holiday
                    </Button>
                </Flex>
            </Flex>
            <HolidayUploadModal
                open={uploading}
                existing={view.holidays.map(h => h.date)}
                onClose={() => setUploading(false)}
                onImported={(v, n) => {
                    setUploading(false);
                    onView(v, `${n} holiday date${n === 1 ? '' : 's'} imported`);
                }}
            />
            <HolidayEditModal
                open={Boolean(editing)}
                holiday={editing === 'new' ? null : editing}
                existing={view.holidays.map(h => h.date)}
                onClose={() => setEditing(null)}
                onSave={async h => {
                    const res = editing && editing !== 'new' ? await updatePublicHoliday(scope, editing.from, h) : await addPublicHoliday(scope, h);
                    const ok = onView(res, `${h.name} ${editing === 'new' ? 'added' : 'updated'}`);
                    if (ok) setYear(h.from.slice(0, 4));
                    return ok;
                }}
            />
            <ConfirmDialog
                open={Boolean(removing)}
                title={`Remove ${removing?.name ?? ''}?`}
                confirm="Remove holiday"
                onClose={() => setRemoving(null)}
                onConfirm={async () => removing && onView(await removePublicHoliday(scope, removing.from), `${removing.name} removed`)}
                data-remove-holiday-confirm
            >
                {removing &&
                    (removing.days === 1
                        ? `${dayjs(removing.from).format('D MMM YYYY')} will be a working day again.`
                        : `${dayjs(removing.from).format('D MMM')} to ${dayjs(removing.to).format('D MMM YYYY')} will be working days again.`)}{' '}
                Calendars, timesheets and leave counts update for everyone.
            </ConfirmDialog>
            <div className="min-w-0 overflow-hidden rounded-lg border border-solid border-[var(--peko-border)] bg-white">
                <Table<HolidayGroup>
                    rowKey="from"
                    size="middle"
                    pagination={false}
                    dataSource={groups}
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No holidays for ${year}. Add the year’s public holidays, or upload them in bulk.`} /> }}
                    columns={[
                        {
                            title: 'Holiday',
                            key: 'n',
                            render: (_, g) => (
                                <span>
                                    <Text className="font-medium">{g.name}</Text>
                                    {g.days === 1 && weekend(g.from) && <StatusTag tone="leave" className="!ml-2">Weekly off</StatusTag>}
                                </span>
                            ),
                        },
                        { title: 'Date', key: 'd', render: (_, g) => <span data-holiday-date={g.from}>{dateText(g)}</span> },
                        { title: 'Days', key: 'c', render: (_, g) => g.days },
                        {
                            title: 'Action',
                            key: 'x',
                            render: (_, g) => (
                                <Flex gap={4} wrap="nowrap">
                                    <Button size="small" onClick={() => setEditing(g)} data-edit-holiday={g.from}>
                                        Edit
                                    </Button>
                                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setRemoving(g)} aria-label={`Remove ${g.name}`} data-remove-holiday={g.from}>
                                        Remove
                                    </Button>
                                </Flex>
                            ),
                        },
                    ]}
                />
            </div>
            <Text type="secondary" className="text-xs" data-holidays-summary>
                {groups.length} holiday{groups.length === 1 ? '' : 's'} · {days} day{days === 1 ? '' : 's'} · {working} on working days
            </Text>
        </Flex>
    );
};

// ---- Configuration ------------------------------------------------------------------------------------------
// PROTOTYPE-SETUP (Leave settings rework — notes pay:settings:leave:config): Credit date (Start / End / Custom, with a
// card each for monthly and daily credits; custom day and time), Rounding, Leave year, Loss of pay, Sandwich rule (on /
// off, when it applies, what counts, a live example), Comp off. The half-day panel is gone (per leave type now).
// Panel descriptions and examples are tooltips.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Config {
    year: LeavePolicy['year'];
    day: number;
    month: number;
    sandwich: SandwichConfig;
    compOn: boolean;
    expiry: number;
    creditDate: LeavePolicy['creditDate'];
    creditDay: number;
    creditTime: string;
    rounding: LeavePolicy['rounding'];
    lop: LeavePolicy['lop'];
    negative: LeavePolicy['negative'];
}

const configOf = (v: LeaveSettingsView): Config => ({
    year: v.policy.year,
    day: Number(v.policy.cycleStart.slice(3)),
    month: Number(v.policy.cycleStart.slice(0, 2)),
    sandwich: v.policy.sandwich,
    compOn: v.policy.compOff.enabled,
    expiry: v.policy.compOff.expiryDays,
    creditDate: v.policy.creditDate,
    creditDay: v.policy.creditDay,
    creditTime: v.policy.creditTime,
    rounding: v.policy.rounding,
    lop: v.policy.lop,
    negative: v.policy.negative,
});

/** A settings card whose title carries the explanation in a tooltip. */
const Panel = ({ title, tip, children, ...rest }: { title: string; tip?: ReactNode; children: ReactNode } & Record<`data-${string}`, unknown>) => (
    <Card
        size="small"
        title={
            <span className="inline-flex items-center">
                {title}
                {tip && <InfoTip title={tip} label={`About ${title}`} />}
            </span>
        }
        {...rest}
    >
        {children}
    </Card>
);

const Label = ({ children, tip }: { children: ReactNode; tip?: ReactNode }) => (
    <Text className="inline-flex items-center text-[13px] font-medium">
        {children}
        {tip && <InfoTip title={tip} />}
    </Text>
);

const Configuration = ({ view, onView }: { view: LeaveSettingsView; onView: (v: LeaveSettingsView | false, msg?: string) => boolean }) => {
    const scope = usePayrollScope();
    const [c, setC] = useState<Config>(() => configOf(view));
    const [busy, setBusy] = useState(false);
    useEffect(() => setC(configOf(view)), [view]);
    const set = <K extends keyof Config>(k: K, v: Config[K]) => setC(cur => ({ ...cur, [k]: v }));
    const setSandwich = (patch: Partial<SandwichConfig>) => setC(cur => ({ ...cur, sandwich: { ...cur.sandwich, ...patch } }));
    const dirty = JSON.stringify(c) !== JSON.stringify(configOf(view));
    const cards = creditDateCards(c.creditDate, c.creditDay, c.creditTime);
    const example = sandwichExample(c.sandwich);
    const save = async () => {
        setBusy(true);
        const res = await updateLeaveConfig(scope, {
            year: c.year,
            cycleStart: `${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`,
            sandwich: c.sandwich,
            compOff: { enabled: c.compOn, expiryDays: c.expiry },
            creditDate: c.creditDate,
            creditDay: c.creditDay,
            creditTime: c.creditTime,
            rounding: c.rounding,
            lop: c.lop,
            negative: c.negative,
        });
        setBusy(false);
        onView(res, 'Leave configuration saved.');
    };
    return (
        <Flex vertical gap={14} data-leave-config>
            <Text className="inline-flex items-center text-sm text-[var(--peko-text-2)]" data-config-scope>
                These rules apply to every leave type
                <InfoTip label="About this page" title="Rules for one leave type (credits, probation, year end, half days, documents) are set on that type in Leave types." />
            </Text>
            <Panel
                title="Credit date"
                tip="When monthly and daily credits land. Types credited all at once aren’t affected. Joiners follow the same schedule from their joining date."
                data-config-credit-date
            >
                <Flex vertical gap={12}>
                    <Radio.Group
                        optionType="button"
                        value={c.creditDate}
                        onChange={e => set('creditDate', e.target.value)}
                        aria-label="Credit date"
                        options={(['START', 'END', 'CUSTOM'] as const).map(v => ({ value: v, label: CREDIT_DATE_LABEL[v] }))}
                    />
                    {c.creditDate === 'CUSTOM' && (
                        <Flex align="center" gap={16} wrap="wrap">
                            <Flex align="center" gap={8}>
                                <Label tip="The day of the month monthly credits land (1–28, so every month has it).">Day</Label>
                                <InputNumber min={1} max={28} value={c.creditDay} onChange={n => set('creditDay', Number(n ?? 1))} className="!w-[72px]" aria-label="Credit day" data-credit-day />
                            </Flex>
                            <Flex align="center" gap={8}>
                                <Label tip="Daily credits count each day from this time.">Time</Label>
                                <TimePicker
                                    value={dayjs(`2000-01-01T${c.creditTime}`)}
                                    format="h:mm A"
                                    use12Hours
                                    minuteStep={15}
                                    allowClear={false}
                                    needConfirm={false}
                                    onChange={t => t && set('creditTime', t.format('HH:mm'))}
                                    aria-label="Credit time"
                                    data-credit-time
                                />
                            </Flex>
                        </Flex>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-credit-cards>
                        <div className="rounded-lg border border-solid border-[var(--peko-border)] px-3 py-2" data-credit-card="monthly">
                            <Text className="block text-[13px] font-medium">Monthly credits</Text>
                            <Text className="text-sm text-[var(--peko-text-2)]">{cards.monthly}</Text>
                        </div>
                        <div className="rounded-lg border border-solid border-[var(--peko-border)] px-3 py-2" data-credit-card="daily">
                            <Text className="block text-[13px] font-medium">Daily credits</Text>
                            <Text className="text-sm text-[var(--peko-text-2)]">{cards.daily}</Text>
                        </div>
                    </div>
                </Flex>
            </Panel>
            <Panel title="Rounding" tip="Applied to credited-so-far and the year’s total. Example: 14 days a year is 1.167 a month; with “Nearest half day” the balance reads 1, 2.5, 3.5 …" data-config-rounding>
                <Radio.Group
                    optionType="button"
                    value={c.rounding}
                    onChange={e => set('rounding', e.target.value)}
                    aria-label="Rounding"
                    options={(['NONE', 'HALF', 'DAY'] as const).map(v => ({ value: v, label: ROUNDING_LABEL[v] }))}
                />
            </Panel>
            <Panel
                title="Leave year"
                tip={`When balances reset. Balances roll forward automatically on the last working day of each leave cycle${
                    view.nextRollForward && view.policy.year === 'COMPANY' ? ` (next: ${dayjs(view.nextRollForward).format('ddd D MMM YYYY')})` : ''
                }: unused days follow each type’s end-of-cycle rule. Nothing to run by hand.`}
                data-config-year
            >
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
                {c.year === 'COMPANY' && (
                    <Flex align="center" gap={8} wrap="wrap" className="mt-3">
                        <Label tip="Everyone’s leave resets on this day; the cycle ends the day before.">Starts on</Label>
                        <InputNumber min={1} max={28} value={c.day} onChange={n => set('day', Number(n ?? 1))} className="!w-[72px]" aria-label="Start day" />
                        <Select value={c.month} onChange={m => set('month', m)} options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} className="!w-[140px]" aria-label="Start month" />
                    </Flex>
                )}
            </Panel>
            <Panel
                title="Loss of pay (unpaid leave)"
                tip="When employees can request loss of pay (ESS → Leave → Request LOP). “Used up” means every yearly balance and comp off is at 0; per-event leave doesn’t count. Loss of pay has no limit and follows the leave approvers."
                data-config-lop
            >
                <Radio.Group
                    value={c.lop}
                    onChange={e => set('lop', e.target.value)}
                    aria-label="Loss of pay"
                    className="flex flex-col gap-1.5"
                    options={(['USED_UP', 'ANY_TIME'] as const).map(v => ({ value: v, label: LOP_RULE_LABEL[v] }))}
                />
            </Panel>
            {/* PROTOTYPE-SETUP (Leave fixes — notes pay:settings:leave:config): Negative balance, on / off and "Up to N days
                below zero per leave type" (empty = no limit). Yearly balance types only. */}
            <Panel
                title="Negative balance"
                tip="If allowed, employees (and HR adding leave) can take more leave than they have. The balance goes below zero and is recovered from the next credits; anything still negative when someone leaves is recovered in the full & final settlement. Applies to yearly balance types, not per-event leave or comp off."
                data-config-negative
            >
                <Flex vertical gap={10}>
                    <Flex align="center" gap={8}>
                        <Switch checked={c.negative.on} onChange={on => set('negative', { ...c.negative, on })} aria-label="Negative balance" data-negative-on />
                        <Text className="text-sm">{c.negative.on ? 'On' : 'Off'}</Text>
                    </Flex>
                    {c.negative.on ? (
                        <Flex align="center" gap={8} wrap="wrap">
                            <Text className="text-sm">Up to</Text>
                            <InputNumber
                                min={0}
                                max={365}
                                step={0.5}
                                placeholder="No limit"
                                value={c.negative.max ?? null}
                                onChange={n => set('negative', { ...c.negative, max: n === null || n === undefined ? null : Math.round(Number(n) * 2) / 2 })}
                                className="!w-[96px]"
                                aria-label="Days below zero"
                                data-negative-max
                            />
                            <Text className="inline-flex items-center text-sm">
                                days below zero per leave type
                                <InfoTip title="Leave it empty for no limit." label="About the limit" />
                            </Text>
                        </Flex>
                    ) : (
                        <Text type="secondary" className="text-sm">
                            Employees can’t take more than their available balance.
                        </Text>
                    )}
                </Flex>
            </Panel>
            <Panel
                title="Sandwich rule"
                tip="Whether days off between two leave days in the same request count as leave. Only days off between the first and the last working day count; half-day requests aren’t affected. Applies to new requests."
                data-config-sandwich
            >
                <Flex vertical gap={12}>
                    <Flex align="center" gap={8}>
                        <Switch checked={c.sandwich.on} onChange={on => setSandwich({ on })} aria-label="Sandwich rule" data-sandwich-on />
                        <Text className="text-sm">{c.sandwich.on ? 'On' : 'Off'}</Text>
                        <InfoTip title={example.text} label="Sandwich rule example" data-sandwich-example />
                    </Flex>
                    {c.sandwich.on && (
                        <>
                            <Flex vertical gap={6}>
                                <Label tip="Only for longer leave: when a request covers more than this many days in total, from the first to the last day.">When it applies</Label>
                                <Flex align="center" gap={8} wrap="wrap">
                                    <Radio.Group
                                        optionType="button"
                                        value={c.sandwich.when}
                                        onChange={e => setSandwich({ when: e.target.value })}
                                        aria-label="When it applies"
                                        data-sandwich-when
                                        options={[
                                            { value: 'always', label: 'Always' },
                                            { value: 'longer', label: 'Only for longer leave' },
                                        ]}
                                    />
                                    {c.sandwich.when === 'longer' && (
                                        <Flex align="center" gap={8}>
                                            <Text className="text-sm">more than</Text>
                                            <InputNumber min={1} max={60} value={c.sandwich.overDays} onChange={n => setSandwich({ overDays: Number(n ?? 1) })} className="!w-[72px]" aria-label="More than N days" data-sandwich-over />
                                            <Text className="text-sm">days</Text>
                                        </Flex>
                                    )}
                                </Flex>
                            </Flex>
                            <Flex vertical gap={6}>
                                <Label>What counts as leave</Label>
                                <Flex gap={16} wrap="wrap">
                                    <Checkbox checked={c.sandwich.weeklyOffs} onChange={e => setSandwich({ weeklyOffs: e.target.checked })} data-sandwich-weekly>
                                        Weekly offs
                                    </Checkbox>
                                    <Checkbox checked={c.sandwich.holidays} onChange={e => setSandwich({ holidays: e.target.checked })} data-sandwich-holidays>
                                        Public holidays
                                    </Checkbox>
                                </Flex>
                            </Flex>
                            <Text className="text-sm" data-sandwich-result>
                                Example: 1st–9th counts {example.with} days ({example.without} without the rule)
                            </Text>
                        </>
                    )}
                </Flex>
            </Panel>
            <Panel
                title="Comp off"
                tip="Employees who work on a weekly off or public holiday can claim a day off for it. Half a shift or more earns half a day, a full shift a full day. Requests follow the leave approvers. A day can be claimed as overtime or comp off, not both."
                data-config-comp-off
            >
                <Flex align="center" gap={8}>
                    <Switch checked={c.compOn} onChange={v => set('compOn', v)} aria-label="Comp off" />
                    <Text className="text-sm">{c.compOn ? 'On' : 'Off'}</Text>
                </Flex>
                {c.compOn && (
                    <Flex align="center" gap={8} wrap="wrap" className="mt-3">
                        <Label tip="0 = never expires.">Expires after</Label>
                        <InputNumber min={0} max={365} value={c.expiry} onChange={n => set('expiry', Number(n ?? 0))} className="!w-[80px]" aria-label="Comp off expires after" />
                        <Text className="text-sm">days</Text>
                    </Flex>
                )}
            </Panel>
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
