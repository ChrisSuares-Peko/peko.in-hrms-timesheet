// PROTOTYPE-SETUP (My team, Slice 4): My team → Team attendance — a month grid, one row per direct report (the name
// column stays put while the days scroll inside the card) and one column per day: weekly offs and holidays shaded,
// today highlighted. Each cell is a code in its status colour:
//   P present · L late · ½ half day · A absent · Lv leave · H holiday · W worked on an off day · In still checked in
// The Late column counts this month's late check-ins up to today. A cell opens the day, read-only: status, shift, check
// in / out (next day when overnight), time at work, timesheet hours, breaks, any late deduction and any pending
// correction with its status.
import { useCallback, useEffect, useState } from 'react';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Modal, Skeleton, Typography } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { addMonths } from '@src/prototype/rules/attendance';
import { lateDayDetail } from '@src/prototype/rules/leavePolicy';

import { getTeamAttendance } from '../api';
import { displayTime, displayTimeOn, formatDuration } from '../components/format';
import { DayStatusTag } from '../components/StatusTags';
import { useAtsScope } from '../hooks/useAtsScope';
import type { DayStatus, PersonRef, TeamAttendanceView } from '../types';

const { Text } = Typography;

type Day = TeamAttendanceView['rows'][number]['days'][number];

const CODE: Partial<Record<DayStatus, string>> = {
    present: 'P',
    late: 'L',
    'half-day': '½',
    absent: 'A',
    'on-leave': 'Lv',
    holiday: 'H',
    'worked-off-day': 'W',
};

/** Code + colours: the status colours (green present, amber late, purple leave, …). */
const LOOK: Record<string, string> = {
    P: 'bg-[#ECFDF3] text-[#027A48]',
    L: 'bg-[#FFFAEB] text-[#B54708]',
    '½': 'bg-[#FFF4ED] text-[#C4320A]',
    A: 'bg-[#FEF3F2] text-[#B42318]',
    Lv: 'bg-[#F4F3FF] text-[#5925DC]',
    H: 'bg-[#ECFDFF] text-[#0E7090]',
    W: 'bg-[#EEF4FF] text-[#3538CD]',
    In: 'bg-[#EFF8FF] text-[#175CD3]',
};

export const cellCode = (d: Pick<Day, 'status' | 'open'>) => (d.open ? 'In' : CODE[d.status] ?? '');

export const LEGEND = 'P present · L late · ½ half day · A absent · Lv leave · H holiday · W worked on an off day · In still checked in';

/** "6:56 PM", "5:00 AM (next day)", "Still checked in" or "–". */
const checkOutText = (day: Day) => {
    if (day.checkOut) return displayTimeOn(day.checkOut, day.outDays);
    return day.checkIn ? 'Still checked in' : '–';
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2 border-0 border-b border-solid border-gray-100 py-1.5 text-sm last:border-b-0">
        <Text type="secondary">{label}</Text>
        <span className="min-w-0 break-words">{children}</span>
    </div>
);

const TeamDayModal = ({ person, day, view, onClose }: { person: PersonRef | null; day: Day | null; view: TeamAttendanceView; onClose: () => void }) => {
    if (!person || !day) return null;
    const off = view.off.includes(day.date);
    return (
        <Modal open title={`${person.name} · ${dayjs(day.date).format('dddd, D MMMM')}`} onCancel={onClose} footer={<Button onClick={onClose}>Close</Button>} destroyOnHidden>
            <div className="mb-2" data-team-day>
                <DayStatusTag status={day.status} label={day.label} />
                {day.label && day.status !== 'holiday' && <Text className="ml-2 text-xs text-gray-500">{day.label}</Text>}
            </div>
            <Row label="Shift">{off ? 'Off' : `${displayTime(view.shift.start)} – ${displayTime(view.shift.end)}`}</Row>
            <Row label="Check in">{day.checkIn ? displayTime(day.checkIn) : '–'}</Row>
            <Row label="Check out">{checkOutText(day)}</Row>
            <Row label="Time at work">{day.checkIn ? formatDuration(day.minutesAtWork) : '–'}</Row>
            {view.mode !== 'attendance' && <Row label="Timesheet">{formatDuration(day.loggedMinutes)} logged</Row>}
            {day.breaks.length > 0 && (
                <Row label={`Breaks · ${formatDuration(day.breakMinutes)}`}>
                    {day.breaks.map(b => `${displayTime(b.start)} – ${b.end ? displayTime(b.end) : 'now'}`).join(', ')}
                </Row>
            )}
            {day.lateMinutes > 0 && <Row label="Late by">{formatDuration(day.lateMinutes)}</Row>}
            {day.lateDeduction && <Row label="Late deduction">{lateDayDetail(day.lateDeduction)}</Row>}
            {day.correction && <Row label="Correction">{day.correction.statusLabel}</Row>}
        </Modal>
    );
};

const TeamAttendanceGrid = () => {
    const scope = useAtsScope();
    const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
    const [view, setView] = useState<TeamAttendanceView | null>(null);
    const [cell, setCell] = useState<{ person: PersonRef; day: Day } | null>(null);

    const load = useCallback(async () => {
        setView(null);
        const res = await getTeamAttendance(scope, month);
        if (res) setView(res);
    }, [scope, month]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <div className="flex min-w-0 flex-col gap-3" data-team-attendance>
            <div className="flex flex-wrap items-center gap-2">
                <Button size="small" icon={<LeftOutlined />} aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))} />
                <Text className="min-w-[120px] text-center font-medium">{dayjs(`${month}-01`).format('MMMM YYYY')}</Text>
                <Button size="small" icon={<RightOutlined />} aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))} />
                <span className="flex-1" />
                <Text type="secondary" className="text-xs">
                    {LEGEND}
                </Text>
            </div>
            {!view ? (
                <Skeleton active paragraph={{ rows: 5 }} />
            ) : (
                <div className={`${ESS_CARD} !p-0 overflow-x-auto`} data-grid-scroll>
                    <table className="border-collapse text-xs">
                        <thead>
                            <tr>
                                <th className="sticky left-0 z-10 min-w-[170px] bg-white px-3 py-2 text-left font-medium text-gray-600">Team member</th>
                                {view.dates.map(d => (
                                    <th
                                        key={d}
                                        className={`px-0.5 py-2 text-center font-normal ${view.off.includes(d) ? 'bg-[#F5F6F7]' : ''} ${d === view.today ? 'font-semibold text-[#FF4F4F]' : 'text-gray-500'}`}
                                    >
                                        {dayjs(d).format('dd').charAt(0)}
                                        <br />
                                        {dayjs(d).date()}
                                    </th>
                                ))}
                                <th className="px-2 py-2 text-center font-medium text-gray-600">Late</th>
                            </tr>
                        </thead>
                        <tbody>
                            {view.rows.map(r => (
                                <tr key={r.employee.id} className="border-0 border-t border-solid border-gray-100" data-team-row={r.employee.name}>
                                    <td className="sticky left-0 z-10 bg-white px-3 py-2">
                                        <span className="block text-sm font-medium text-gray-900">{r.employee.name}</span>
                                        <span className="block text-[11px] text-gray-500">{r.employee.designation}</span>
                                    </td>
                                    {r.days.map(d => {
                                        const code = d.date <= view.today || d.status === 'on-leave' ? cellCode(d) : '';
                                        return (
                                            <td key={d.date} className={`px-0.5 py-1 text-center ${view.off.includes(d.date) ? 'bg-[#F5F6F7]' : ''} ${d.date === view.today ? 'bg-[#FFF1F1]' : ''}`}>
                                                <button
                                                    type="button"
                                                    title={`${dayjs(d.date).format('ddd D MMM')}${d.label ? `: ${d.label}` : ''}`}
                                                    onClick={() => setCell({ person: r.employee, day: d })}
                                                    className={`h-[22px] w-[26px] cursor-pointer rounded border-0 p-0 text-[10px] font-semibold ${code ? LOOK[code] : 'bg-transparent text-gray-300'}`}
                                                    data-cell={code || '-'}
                                                    data-date={d.date}
                                                >
                                                    {code}
                                                </button>
                                            </td>
                                        );
                                    })}
                                    <td className="px-2 text-center">
                                        {r.lateCount ? <span className="rounded-full bg-[#FFFAEB] px-2 py-0.5 font-semibold text-[#B54708]">{r.lateCount}</span> : <span className="text-gray-400">0</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {view.rows.length === 0 && <Text className="block p-4 text-sm text-gray-500">No one reports to you yet.</Text>}
                </div>
            )}
            {view && <TeamDayModal person={cell?.person ?? null} day={cell?.day ?? null} view={view} onClose={() => setCell(null)} />}
        </div>
    );
};

export default TeamAttendanceGrid;
