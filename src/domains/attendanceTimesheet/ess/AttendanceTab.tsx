// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — the employee's Attendance tab: today (check-in / check-out with a
// live timer), the month calendar back to the joining month, a day detail drawer with corrections, monthly
// totals and "My correction requests".
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LockOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import dayjs from 'dayjs';

import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';

import {
    cancelCorrection,
    CorrectionWithStatus,
    getAttendanceMonth,
    getCorrections,
} from '../api';
import CorrectionModal from '../components/CorrectionModal';
import { formatDuration } from '../components/format';
import { useAtsScope } from '../hooks/useAtsScope';
import { AttendancePunch } from '../overview/OvAttendanceCard';
import type { AtsOverview, AttendanceDay, AttendanceMonthView, CorrectionKind } from '../types';
import AttendanceCalendar from './AttendanceCalendar';
import CorrectionsList from './CorrectionsList';
import DayDetailDrawer from './DayDetailDrawer';
import { Panel, StatTile, todayIso } from './ui';

export interface AttendanceTabProps {
    overview: AtsOverview;
    /** Check-in / check-out answer with a fresh overview. */
    onOverview: (next: AtsOverview) => void;
    /** Something changed (correction raised or cancelled) — the section refreshes its counts. */
    onChanged?: () => void;
    /** PROTOTYPE-SETUP (Overview, Slice 2): open on this day (its month, with the day's details open). */
    initialDate?: string;
}

interface ModalState {
    /** PROTOTYPE-SETUP (Attendance tab, Slice 2): null = the employee picks the day in the popup. */
    date: string | null;
    kind: CorrectionKind;
    current?: { checkIn: string | null; checkOut: string | null; checkOutAuto: boolean };
}

const AttendanceTab = ({ overview, onOverview, onChanged, initialDate }: AttendanceTabProps) => {
    const scope = useAtsScope();
    const today = todayIso();
    const [month, setMonth] = useState((initialDate ?? today).slice(0, 7));
    const [view, setView] = useState<AttendanceMonthView | null>(null);
    const [loading, setLoading] = useState(true);
    const [corrections, setCorrections] = useState<CorrectionWithStatus[] | null>(null);
    const [selected, setSelected] = useState<string | null>(initialDate ?? null);
    const [modal, setModal] = useState<ModalState | null>(null);
    const [cancelling, setCancelling] = useState(false);

    const loadMonth = useCallback(
        async (m: string, quiet = false) => {
            if (!quiet) setLoading(true);
            const res = await getAttendanceMonth(scope, m);
            if (res) setView(res);
            setLoading(false);
        },
        [scope]
    );

    const loadCorrections = useCallback(async () => {
        const res = await getCorrections(scope);
        setCorrections(res || []);
    }, [scope]);

    useEffect(() => {
        loadMonth(month);
    }, [loadMonth, month]);

    useEffect(() => {
        loadCorrections();
    }, [loadCorrections]);

    const refreshAll = () => {
        loadMonth(month, true);
        loadCorrections();
        onChanged?.();
    };

    const selectedDay: AttendanceDay | null = useMemo(
        () => (selected && view?.days.find(d => d.date === selected)) || null,
        [selected, view]
    );
    const selectedCorrection = useMemo(
        () =>
            selectedDay?.correction
                ? corrections?.find(c => c.id === selectedDay.correction?.id)
                : undefined,
        [selectedDay, corrections]
    );

    const openDay = (date: string) => {
        if (date.slice(0, 7) !== month) setMonth(date.slice(0, 7));
        setSelected(date);
    };

    const onPunch = (next: AtsOverview) => {
        onOverview(next);
        if (month === today.slice(0, 7)) loadMonth(month, true);
    };

    const onCancelCorrection = async (id: string) => {
        setCancelling(true);
        const res = await cancelCorrection(scope, id);
        setCancelling(false);
        if (res) {
            setCorrections(res);
            loadMonth(month, true);
            onChanged?.();
        }
    };

    // PROTOTYPE-SETUP (Attendance tab, Slice 2): "Request correction" above the calendar and on "My correction
    // requests" opens the popup with no day picked.
    const requestButton = (
        <Button onClick={() => setModal({ date: null, kind: 'correction' })} className="rounded-lg font-medium">
            Request correction
        </Button>
    );

    const totals = view?.month === month ? view.totals : null;
    const tiles = totals
        ? [
              { label: 'Present', value: totals.present, tone: 'bg-[#ECFDF3]' },
              { label: 'Late', value: totals.late, tone: 'bg-[#FFFAEB]' },
              { label: 'Half day', value: totals.halfDay, tone: 'bg-[#FFF1E6]' },
              { label: 'Absent', value: totals.absent, tone: 'bg-[#FEF3F2]' },
              { label: 'On leave', value: totals.onLeave, tone: 'bg-[#F9F0FF]' },
              { label: 'Holidays', value: totals.holidays, tone: 'bg-[#E6FFFB]' },
              { label: 'Worked off-days', value: totals.workedOffDays, tone: 'bg-[#F0F5FF]' },
              { label: 'Time at work', value: formatDuration(totals.minutesAtWork) },
              { label: 'Overtime', value: formatDuration(totals.overtimeMinutes) },
          ]
        : [];

    return (
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
            {/* PROTOTYPE-SETUP (Attendance tab, Slice 1): two equal columns from 1200px. The left column (Today, then the
                month totals) is exactly as tall as the calendar card: both left cards grow and spread their content out.
                Stacked below 1200px, heights automatic. */}
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
                    <EssCard label="Today" heading={<EssSectionHeading title="Today" />} className="xl:flex-1 xl:justify-between">
                        <AttendancePunch overview={overview} onOverview={onPunch} />
                    </EssCard>
                    <Panel
                        className="flex flex-col xl:flex-1"
                        title={`${view?.month === month ? view.monthLabel : dayjs(`${month}-01`).format('MMMM YYYY')} totals`}
                        subtitle={
                            month === today.slice(0, 7) ? 'So far this month' : undefined
                        }
                    >
                        {totals ? (
                            <div className="grid grid-cols-3 gap-2 xl:flex-1 xl:content-evenly">
                                {tiles.map(t => (
                                    <StatTile key={t.label} {...t} />
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-2 xl:flex-1 xl:content-evenly">
                                {Array.from({ length: 9 }, (_, i) => (
                                    <span
                                        key={i}
                                        className="block h-[58px] rounded-xl bg-gray-100 animate-pulse"
                                    />
                                ))}
                            </div>
                        )}
                    </Panel>
                </div>
                <Panel
                    title="Attendance calendar"
                    subtitle="Tap a day to see the details or request a correction."
                    extra={requestButton}
                >
                    {view?.month === month && view.locked && (
                        <Alert
                            type="info"
                            showIcon
                            icon={<LockOutlined />}
                            className="mb-3"
                            message={`Payroll for ${view.monthLabel} has been processed — this month is read-only.`}
                        />
                    )}
                    <AttendanceCalendar
                        month={month}
                        view={view}
                        loading={loading}
                        today={today}
                        selected={selected}
                        onSelect={d => setSelected(d.date)}
                        onMonth={m => {
                            setSelected(null);
                            setMonth(m);
                        }}
                    />
                </Panel>
            </div>

            <Panel
                title="My correction requests"
                subtitle="Changes to your check-in or check-out go to your manager for approval."
                extra={requestButton}
            >
                <CorrectionsList
                    items={corrections}
                    onUpdated={list => {
                        setCorrections(list);
                        loadMonth(month, true);
                        onChanged?.();
                    }}
                    onOpenDay={openDay}
                />
            </Panel>

            <DayDetailDrawer
                day={selectedDay}
                today={today}
                correction={selectedCorrection}
                cancelling={cancelling}
                onClose={() => setSelected(null)}
                onCancelCorrection={onCancelCorrection}
                onRequest={kind =>
                    selectedDay &&
                    setModal({
                        date: selectedDay.date,
                        kind,
                        current: {
                            checkIn: selectedDay.checkIn,
                            checkOut: selectedDay.checkOut,
                            checkOutAuto: selectedDay.checkOutAuto,
                        },
                    })
                }
            />

            <CorrectionModal
                open={Boolean(modal)}
                date={modal?.date ?? null}
                current={modal?.current}
                shiftEnd={overview.shift.end}
                shiftStart={overview.shift.start}
                onClose={() => setModal(null)}
                onSubmitted={() => {
                    setSelected(null);
                    refreshAll();
                }}
            />
        </div>
    );
};

export default AttendanceTab;
