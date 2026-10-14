// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — the employee's Attendance tab: today (check-in / check-out with a
// live timer), the month calendar back to the joining month, a day detail drawer with corrections, monthly
// totals and "My correction requests".
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { LockOutlined } from '@ant-design/icons';
import { Alert, Button, Tooltip } from 'antd';
import dayjs from 'dayjs';

import { EssCard, EssSectionHeading } from '@src/components/ess/EssUi';

import {
    cancelCorrection,
    CorrectionWithStatus,
    getAttendanceMonth,
    getCorrections,
    getOwnCheckOuts,
} from '../api';
import CorrectionModal from '../components/CorrectionModal';
import { formatDuration } from '../components/format';
import './attendance.css';
import { useAtsScope } from '../hooks/useAtsScope';
import { AttendancePunch } from '../overview/OvAttendanceCard';
import type { AtsOverview, AttendanceDay, AttendanceMonthView, CorrectionKind, OwnCheckOutUpdate } from '../types';
import AttendanceCalendar, { CalendarMonthNav } from './AttendanceCalendar';
import CorrectionsList from './CorrectionsList';
import DayDetailDrawer from './DayDetailDrawer';
import { Panel, todayIso } from './ui';

export interface AttendanceTabProps {
    overview: AtsOverview;
    /** Check-in / check-out answer with a fresh overview. */
    onOverview: (next: AtsOverview) => void;
    /** Something changed (correction raised or cancelled) — the section refreshes its counts. */
    onChanged?: () => void;
    /** PROTOTYPE-SETUP (Overview, Slice 2): open on this day (its month, with the day's details open). */
    initialDate?: string;
}

interface TotalTileProps {
    label: string;
    value: ReactNode;
    tone?: string;
    /** Shown on hover. */
    hint?: string;
}

/** PROTOTYPE-SETUP (Attendance layout, Slice 2): a compact month-total tile — 18px value, 12px label. */
const TotalTile = ({ label, value, tone = 'bg-[#F7F7F7]', hint }: TotalTileProps) => {
    const tile = (
        <div data-total-tile className={`flex min-w-0 flex-col justify-center rounded-xl px-3 py-2 ${tone}`}>
            <span className="text-[18px] font-semibold leading-tight text-[#080808] tabular-nums">{value}</span>
            <span className="text-xs leading-snug text-[#616161]">{label}</span>
        </div>
    );
    return hint ? <Tooltip title={hint}>{tile}</Tooltip> : tile;
};

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
    /** PROTOTYPE-SETUP (Attendance layout, Slice 3): check-outs entered by the employee, listed with the requests. */
    const [ownUpdates, setOwnUpdates] = useState<OwnCheckOutUpdate[]>([]);
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
        const [res, own] = await Promise.all([getCorrections(scope), getOwnCheckOuts(scope)]);
        setOwnUpdates(own || []);
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

    const requestCorrection = () => setModal({ date: null, kind: 'correction' });
    const changeMonth = (m: string) => {
        setSelected(null);
        setMonth(m);
    };

    const totals = view?.month === month ? view.totals : null;
    // PROTOTYPE-SETUP (Attendance layout, Slice 2): 8 compact tiles. Time at work and overtime share the last one:
    // overtime counts qualifying days only (the month view applies the HR minimum); time at work leaves out missed
    // check-outs that haven't been updated (they have no known time at work).
    const tiles: TotalTileProps[] = totals
        ? [
              { label: 'Present', value: totals.present, tone: 'bg-[#ECFDF3]' },
              { label: 'Late', value: totals.late, tone: 'bg-[#FFFAEB]' },
              { label: 'Half day', value: totals.halfDay, tone: 'bg-[#FFF1E6]' },
              { label: 'Absent', value: totals.absent, tone: 'bg-[#FEF3F2]' },
              { label: 'On leave', value: totals.onLeave, tone: 'bg-[#F9F0FF]' },
              { label: 'Holidays', value: totals.holidays, tone: 'bg-[#E6FFFB]' },
              { label: 'Worked off-days', value: totals.workedOffDays, tone: 'bg-[#F0F5FF]' },
              {
                  label: `worked, ${totals.overtimeMinutes ? `${formatDuration(totals.overtimeMinutes)} overtime` : 'no overtime'}`,
                  value: formatDuration(totals.minutesAtWork),
                  hint: 'Excludes days with a missed check-out.',
              },
          ]
        : [];

    return (
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
            {/* PROTOTYPE-SETUP (Attendance final, Slice 1): a header row — a short line and the tab's one "Request
                correction" (opens the popup with no date). Full-width button on phones. */}
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-[#616161]">Check in and out, see your month, and fix anything that’s wrong.</span>
                <span className="hidden flex-1 md:block" />
                <Button type="primary" className="w-full rounded-lg font-medium md:w-auto" onClick={requestCorrection}>
                    Request correction
                </Button>
            </div>

            {/* PROTOTYPE-SETUP (Attendance final, Slice 1): the grid (attendance.css) — ≥1200px: [Today] [Totals] [Requests]
                over [Calendar (columns 1–2)] [Requests, continued]; 768–1199px: Today | Totals, calendar, requests;
                phones: one column. */}
            <div className="att-grid">
                <EssCard label="Today" heading={<EssSectionHeading title="Today" />} className="att-today">
                    <AttendancePunch overview={overview} onOverview={onPunch} pinActions />
                </EssCard>
                <Panel
                    className="att-totals flex flex-col"
                    title={`${view?.month === month ? view.monthLabel : dayjs(`${month}-01`).format('MMMM YYYY')} totals`}
                    subtitle={
                        month === today.slice(0, 7) ? 'So far this month' : undefined
                    }
                >
                    {/* 4 × 2 (2 × 4 on phones); at 1200px+ the tiles fill the row's height (no empty block under them). */}
                    {totals ? (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex-1 xl:auto-rows-fr">
                            {tiles.map(t => (
                                <TotalTile key={t.label} {...t} />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex-1 xl:auto-rows-fr">
                            {Array.from({ length: 8 }, (_, i) => (
                                <span
                                    key={i}
                                    className="block h-[58px] rounded-xl bg-gray-100 animate-pulse"
                                />
                            ))}
                        </div>
                    )}
                </Panel>
                <Panel
                    className="att-cal"
                    title="Attendance calendar"
                    extra={<CalendarMonthNav month={month} view={view} loading={loading} today={today} onMonth={changeMonth} />}
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
                        onMonth={changeMonth}
                        hideNav
                    />
                    <span className="mt-2 block text-xs text-[#9e9e9e]">Tap a day for details, or to update a missed check-out.</span>
                </Panel>
                {/* Spans both rows; ≥1200px its content never makes the rows taller — the list scrolls inside. */}
                <div className="att-req">
                    <Panel className="att-req-in" title="My correction requests">
                        <div className="att-req-list">
                            <CorrectionsList
                                items={corrections}
                                ownUpdates={ownUpdates}
                                onRequest={requestCorrection}
                                onUpdated={list => {
                                    setCorrections(list);
                                    loadMonth(month, true);
                                    onChanged?.();
                                }}
                                onOpenDay={openDay}
                            />
                        </div>
                    </Panel>
                </div>
            </div>

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
