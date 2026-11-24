// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — the employee's Attendance tab: today (check-in / check-out with a
// live timer), the month calendar back to the joining month, a day detail drawer with corrections, monthly
// totals and "My correction requests".
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { LockOutlined } from '@ant-design/icons';
import { Alert, Button, Segmented, Tooltip } from 'antd';
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
import './attendance.css';
import { useAtsScope } from '../hooks/useAtsScope';
import { AttendancePunch } from '../overview/OvAttendanceCard';
import type { AtsOverview, AttendanceDay, AttendanceMonthView, CorrectionTimes } from '../types';
import AttendanceCalendar, { CalendarMonthNav } from './AttendanceCalendar';
import CorrectionsList, { CorrectionsFilter, isPending } from './CorrectionsList';
import DayDetailDrawer from './DayDetailDrawer';
import LateNotesPanel from './LateNotesPanel';
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
const TotalTile = ({ label, value, tone = 'bg-[var(--peko-track)]', hint }: TotalTileProps) => {
    const tile = (
        <div data-total-tile className={`flex min-w-0 flex-col justify-center rounded-lg px-3 py-2 ${tone}`}>
            <span className="text-[18px] font-semibold leading-tight text-[var(--peko-text)] tabular-nums">{value}</span>
            <span className="text-xs leading-snug text-[var(--peko-muted)]">{label}</span>
        </div>
    );
    return hint ? <Tooltip title={hint}>{tile}</Tooltip> : tile;
};

interface ModalState {
    /** PROTOTYPE-SETUP (Attendance tab, Slice 2): null = the employee picks the day in the popup. */
    date: string | null;
    current?: CorrectionTimes & { open?: boolean };
}

const AttendanceTab = ({ overview, onOverview, onChanged, initialDate }: AttendanceTabProps) => {
    const scope = useAtsScope();
    const today = todayIso();
    const [month, setMonth] = useState((initialDate ?? today).slice(0, 7));
    const [view, setView] = useState<AttendanceMonthView | null>(null);
    const [loading, setLoading] = useState(true);
    const [corrections, setCorrections] = useState<CorrectionWithStatus[] | null>(null);
    const [reqFilter, setReqFilter] = useState<CorrectionsFilter>('pending');
    const [selected, setSelected] = useState<string | null>(initialDate ?? null);
    const [modal, setModal] = useState<ModalState | null>(null);
    const [cancelling, setCancelling] = useState(false);
    // PROTOTYPE-SETUP (Leave module): the Notes panel reloads after a dispute is raised or cancelled.
    const [notesKey, setNotesKey] = useState(0);

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
        setNotesKey(k => k + 1);
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

    const requestCorrection = () => setModal({ date: null });
    const pendingCount = (corrections ?? []).filter(isPending).length;
    const allCount = corrections?.length ?? 0;
    const changeMonth = (m: string) => {
        setSelected(null);
        setMonth(m);
    };

    const totals = view?.month === month ? view.totals : null;
    // PROTOTYPE-SETUP (Attendance final, Slice 2; HR rules, Slice 2): 9 compact tiles, 3 × 3, tinted by type (the
    // reference's totals). Holidays are weekday holidays; Break time is the month's recorded breaks. The last tile
    // merges time at work (check-in to check-out, breaks included; days still checked in aren't counted yet) with
    // overtime from qualifying days only (the HR minimum).
    const tiles: TotalTileProps[] = totals
        ? [
              { label: 'Present', value: totals.present, tone: 'bg-[var(--peko-success-bg)]' },
              { label: 'Late', value: totals.late, tone: 'bg-[var(--peko-warning-bg)]' },
              { label: 'Half day', value: totals.halfDay, tone: 'bg-[var(--peko-warning-bg)]' },
              { label: 'Absent', value: totals.absent, tone: 'bg-[var(--peko-error-bg)]' },
              { label: 'On leave', value: totals.onLeave, tone: 'bg-[var(--peko-leave-bg)]' },
              { label: 'Holidays', value: totals.holidays, tone: 'bg-[var(--peko-leave-bg)]' },
              { label: 'Worked off-days', value: totals.workedOffDays, tone: 'bg-[var(--peko-warning-bg)]' },
              { label: 'Break time', value: formatDuration(totals.breakMinutes), tone: 'bg-[#EFF1F4]' },
              {
                  label: `worked, ${totals.overtimeMinutes ? `${formatDuration(totals.overtimeMinutes)} overtime` : 'no overtime'}`,
                  value: formatDuration(totals.minutesAtWork),
                  tone: 'bg-[var(--peko-track)] ring-1 ring-inset ring-[#e6e6e6]',
                  hint: 'Check-in to check-out, breaks included. Days you’re still checked in aren’t counted yet.',
              },
          ]
        : [];

    return (
        <div className="flex flex-col gap-4 sm:gap-6 min-w-0">
            {/* PROTOTYPE-SETUP (Attendance final, Slice 1): a header row — a short line and the tab's one "Request
                correction" (opens the popup with no date). Full-width button on phones. */}
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-[var(--peko-muted)]">Check in and out, see your month, and fix anything that’s wrong.</span>
                <span className="hidden flex-1 md:block" />
                <Button type="primary" className="w-full font-medium md:w-auto" onClick={requestCorrection}>
                    Request correction
                </Button>
            </div>

            {/* PROTOTYPE-SETUP (Leave module): late check-in deductions and their disputes (latest 5). */}
            <LateNotesPanel reloadKey={notesKey} onDispute={date => setModal({ date })} />

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
                    subtitle={month === today.slice(0, 7) ? 'So far this month' : 'Whole month'}
                >
                    {/* 3 × 3 at every width (they fit at 375px); side by side with Today the tiles share the row's height. */}
                    {totals ? (
                        <div className="grid grid-cols-3 gap-2 md:flex-1 md:auto-rows-fr">
                            {tiles.map(t => (
                                <TotalTile key={t.label} {...t} />
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-2 md:flex-1 md:auto-rows-fr">
                            {Array.from({ length: 9 }, (_, i) => (
                                <span
                                    key={i}
                                    className="block h-[58px] rounded-lg bg-[var(--peko-track)] animate-pulse"
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
                    <span className="mt-2 block text-xs text-[var(--peko-muted)]">Tap a day for details or to request a correction.</span>
                </Panel>
                {/* Spans both rows; ≥1200px its content never makes the rows taller — the list scrolls inside. */}
                <div className="att-req">
                    <Panel className="att-req-in" title="My correction requests">
                        {/* PROTOTYPE-SETUP (Attendance final, Slice 3): Pending / All with counts (default Pending). */}
                        <Segmented<CorrectionsFilter>
                            className="mb-3 self-start"
                            value={reqFilter}
                            onChange={setReqFilter}
                            options={[
                                { value: 'pending', label: `Pending (${pendingCount})` },
                                { value: 'all', label: `All (${allCount})` },
                            ]}
                        />
                        <div className="att-req-list">
                            <CorrectionsList
                                items={corrections}
                                filter={reqFilter}
                                onRequest={requestCorrection}
                                onUpdated={list => {
                                    setCorrections(list);
                                    setNotesKey(k => k + 1);
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
                onRequest={() =>
                    selectedDay &&
                    setModal({
                        date: selectedDay.date,
                        current: {
                            checkIn: selectedDay.checkIn,
                            checkOut: selectedDay.checkOut,
                            outDays: selectedDay.outDays,
                            open: selectedDay.open,
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
