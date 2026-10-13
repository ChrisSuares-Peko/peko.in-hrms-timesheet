// PROTOTYPE-SETUP: ESS Service 1, Slice 3 — the employee's Attendance tab: today (check-in / check-out with a
// live timer), the month calendar back to the joining month, a day detail drawer with corrections, monthly
// totals and "My correction requests".
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { useAtsScope } from '../hooks/useAtsScope';
import { AttendancePunch } from '../overview/OvAttendanceCard';
import type { AtsOverview, AttendanceDay, AttendanceMonthView, CorrectionKind, OwnCheckOutUpdate } from '../types';
import AttendanceCalendar from './AttendanceCalendar';
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
    /** PROTOTYPE-SETUP (Attendance layout, Slice 1): bumped by the tab row's "Request correction" — opens the popup. */
    requestSignal?: number;
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

const AttendanceTab = ({ overview, onOverview, onChanged, initialDate, requestSignal = 0 }: AttendanceTabProps) => {
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

    // Open the popup (no date) when the tab row's button is clicked — not for a click from before this tab mounted.
    const seenSignal = useRef(requestSignal);
    useEffect(() => {
        if (requestSignal === seenSignal.current) return;
        seenSignal.current = requestSignal;
        setModal({ date: null, kind: 'correction' });
    }, [requestSignal]);

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
            {/* PROTOTYPE-SETUP (Attendance layout, Slice 1): phones get "Request correction" as the first row (from 768px
                it sits on the right of the tab row). */}
            <div className="flex justify-end md:hidden">
                <Button type="primary" className="rounded-lg font-medium" onClick={requestCorrection}>
                    Request correction
                </Button>
            </div>

            {/* PROTOTYPE-SETUP (Attendance layout, Slice 1): a 2×2 grid from 1200px — [Today] [Month totals] /
                [Attendance calendar] [My correction requests]. The calendar keeps its size (half the row), so the left
                column is the calendar's width and the right takes the rest. Row 1 is as tall as its taller card; the
                requests card fills the calendar's row without adding to its height and scrolls inside. Stacked below
                1200px in DOM order, heights automatic. */}
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
                <EssCard label="Today" heading={<EssSectionHeading title="Today" />}>
                    <AttendancePunch overview={overview} onOverview={onPunch} />
                </EssCard>
                <Panel
                    className="flex flex-col"
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
                <Panel
                    className="flex flex-col xl:h-0 xl:min-h-full"
                    title="My correction requests"
                    subtitle="Changes to your check-in or check-out go to your manager for approval."
                >
                    <div className="min-h-0 flex-1 xl:overflow-y-auto" data-corrections-scroll>
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
