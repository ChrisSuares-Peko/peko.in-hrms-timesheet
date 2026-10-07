// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — the employee's Attendance tab: today (check-in / check-out with a
// live timer), the month calendar back to the joining month, a day detail drawer with corrections, monthly
// totals and "My correction requests".
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LockOutlined } from '@ant-design/icons';
import { Alert, Col, Row } from 'antd';
import dayjs from 'dayjs';

import {
    cancelCorrection,
    CorrectionWithStatus,
    getAttendanceMonth,
    getCorrections,
} from '../api';
import CorrectionModal from '../components/CorrectionModal';
import { formatDuration } from '../components/format';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsOverview, AttendanceDay, AttendanceMonthView, CorrectionKind } from '../types';
import AttendanceCalendar from './AttendanceCalendar';
import CorrectionsList from './CorrectionsList';
import DayDetailDrawer from './DayDetailDrawer';
import TodayPunch from './TodayPunch';
import { Panel, StatTile, todayIso } from './ui';

export interface AttendanceTabProps {
    overview: AtsOverview;
    /** Check-in / check-out answer with a fresh overview. */
    onOverview: (next: AtsOverview) => void;
    /** Something changed (correction raised or cancelled) — the section refreshes its counts. */
    onChanged?: () => void;
}

interface ModalState {
    date: string;
    kind: CorrectionKind;
    current: { checkIn: string | null; checkOut: string | null; checkOutAuto: boolean };
}

const AttendanceTab = ({ overview, onOverview, onChanged }: AttendanceTabProps) => {
    const scope = useAtsScope();
    const today = todayIso();
    const [month, setMonth] = useState(today.slice(0, 7));
    const [view, setView] = useState<AttendanceMonthView | null>(null);
    const [loading, setLoading] = useState(true);
    const [corrections, setCorrections] = useState<CorrectionWithStatus[] | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
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
            <Row gutter={[24, 24]}>
                <Col xs={24} xl={9} className="min-w-0">
                    <div className="flex flex-col gap-4 sm:gap-6">
                        <Panel title="Today" subtitle={dayjs(today).format('dddd, D MMMM')}>
                            <TodayPunch overview={overview} onOverview={onPunch} />
                        </Panel>
                        <Panel
                            title={`${view?.month === month ? view.monthLabel : dayjs(`${month}-01`).format('MMMM YYYY')} totals`}
                            subtitle={
                                month === today.slice(0, 7) ? 'So far this month' : undefined
                            }
                        >
                            {totals ? (
                                <div className="grid grid-cols-3 gap-2">
                                    {tiles.map(t => (
                                        <StatTile key={t.label} {...t} />
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 gap-2">
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
                </Col>
                <Col xs={24} xl={15} className="min-w-0">
                    <Panel
                        title="Attendance calendar"
                        subtitle="Tap a day to see the details or request a correction."
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
                </Col>
            </Row>

            <Panel
                title="My correction requests"
                subtitle="Changes to your check-in or check-out go to your manager for approval."
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
                kind={modal?.kind ?? 'correction'}
                current={modal?.current}
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
