// PROTOTYPE-SETUP: ESS Service 1, Slices 2–3 — today's attendance with check-in / check-out. Shared by the ESS
// Home card and the Attendance tab. Everything comes from AtsOverview.today: the buttons follow canCheckIn /
// canCheckOut and the server's hint; the "time at work" timer ticks locally from the check-in time.
import { MouseEvent, ReactNode, useState } from 'react';

import {
    CalendarOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    EnvironmentFilled,
    SmileOutlined,
} from '@ant-design/icons';
import { Button, Typography } from 'antd';
import dayjs from 'dayjs';

import PunchModal from '@src/domains/employee/components/dashboard/PunchModal';
import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { checkIn, checkOut } from '../api';
import { fmtClock, secondsSince, useNow } from './ui';
import { displayTime, formatDuration } from '../components/format';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsOverview } from '../types';

const { Text } = Typography;

interface TodayPunchProps {
    overview: AtsOverview;
    /** The server answers check-in / check-out with a fresh overview. */
    onOverview: (next: AtsOverview) => void;
}

interface BoxLook {
    bg: string;
    accent: string;
    icon: ReactNode;
    title: string;
    sub: string;
}

const lookFor = (overview: AtsOverview, onClock: boolean): BoxLook => {
    const t = overview.today;
    const dateLine = dayjs(t.date).format('dddd, D MMMM');
    const shiftLine = `Shift ${displayTime(overview.shift.start)}–${displayTime(overview.shift.end)}`;
    if (onClock) {
        const late = t.status === 'late' || t.lateMinutes > 0;
        return {
            bg: late ? '#FFFAEB' : '#eaf9f0',
            accent: late ? '#B78912' : '#43B75D',
            icon: <EnvironmentFilled />,
            title: late ? 'Checked in late' : 'Checked in on time',
            sub: late ? `${formatDuration(t.lateMinutes)} after shift start` : dateLine,
        };
    }
    if (t.checkIn && t.checkOut) {
        return {
            bg: '#f5f6f7',
            accent: '#43B75D',
            icon: <CheckCircleFilled />,
            title: 'Checked out',
            sub: `${dateLine} · done for the day`,
        };
    }
    if (t.status === 'on-leave') {
        return {
            bg: '#F9F0FF',
            accent: '#722ED1',
            icon: <SmileOutlined />,
            title: 'On leave today',
            sub: t.label ?? dateLine,
        };
    }
    if (t.status === 'holiday' || t.status === 'weekly-off') {
        return {
            bg: '#E6FFFB',
            accent: '#08979C',
            icon: <CalendarOutlined />,
            title: t.status === 'holiday' ? t.label ?? 'Holiday' : 'Weekly off',
            sub: t.canCheckIn ? 'Working today? You can still check in.' : dateLine,
        };
    }
    return {
        bg: '#F7F7F7',
        accent: '#ff4f4f',
        icon: <EnvironmentFilled />,
        title: 'Not checked in yet',
        sub: `${shiftLine} · ${overview.graceMinutes} min grace`,
    };
};

const TimeCell = ({ label, value, note }: { label: string; value: string; note?: string }) => (
    <div className="min-w-0">
        <Text className="block text-[11px] uppercase tracking-wide text-titleText">{label}</Text>
        <Text className="block text-sm font-semibold text-valueText tabular-nums">
            {value}
            {note && <span className="ml-1 text-[11px] font-normal text-titleText">{note}</span>}
        </Text>
    </div>
);

const TodayPunch = ({ overview, onOverview }: TodayPunchProps) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const t = overview.today;
    const onClock = Boolean(t.checkIn) && !t.checkOut;
    const now = useNow(onClock);
    const [confirm, setConfirm] = useState<'in' | 'out' | null>(null);
    const [busy, setBusy] = useState(false);

    const elapsed = onClock && t.checkIn ? secondsSince(t.date, t.checkIn, now) : 0;
    const atWorkMinutes = onClock ? Math.floor(elapsed / 60) : t.minutesAtWork;
    const look = lookFor(overview, onClock);

    const open = (mode: 'in' | 'out') => (e: MouseEvent) => {
        e.stopPropagation();
        setConfirm(mode);
    };

    const punch = async () => {
        if (!confirm) return;
        setBusy(true);
        const next = await (confirm === 'in' ? checkIn(scope) : checkOut(scope));
        setBusy(false);
        setConfirm(null);
        if (!next) return;
        const time = confirm === 'in' ? next.today.checkIn : next.today.checkOut;
        dispatch(
            showToast({
                description: `${confirm === 'in' ? 'Checked in' : 'Checked out'}${time ? ` at ${displayTime(time)}` : ''}.`,
                variant: 'success',
            })
        );
        onOverview(next);
    };

    return (
        <div className="flex flex-col gap-4 min-w-0">
            <div
                className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 min-w-0"
                style={{ backgroundColor: look.bg }}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0" style={{ color: look.accent }}>
                        {look.icon}
                    </span>
                    <div className="min-w-0">
                        <Text
                            className="block text-[15px] font-semibold leading-tight"
                            style={{ color: onClock ? look.accent : '#1e293b' }}
                        >
                            {look.title}
                        </Text>
                        <Text className="block text-xs text-[#616161] truncate">{look.sub}</Text>
                    </div>
                </div>
                {onClock && (
                    <span
                        className="shrink-0 bg-white rounded-lg px-2.5 py-1 text-sm font-semibold tabular-nums"
                        style={{ color: look.accent }}
                        title="Time at work so far"
                    >
                        {fmtClock(elapsed)}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-3 gap-2">
                <TimeCell label="Check-in" value={t.checkIn ? displayTime(t.checkIn) : '—'} />
                <TimeCell
                    label="Check-out"
                    value={t.checkOut ? displayTime(t.checkOut) : '—'}
                    note={t.checkOutAuto ? 'auto' : undefined}
                />
                <TimeCell
                    label="At work"
                    value={t.checkIn ? formatDuration(atWorkMinutes) : '—'}
                />
            </div>

            {(t.canCheckIn || t.canCheckOut || t.hint) && (
                <div className="flex flex-col gap-1.5">
                    {t.canCheckIn && (
                        <Button
                            type="primary"
                            block
                            icon={<ClockCircleOutlined />}
                            onClick={open('in')}
                            className="h-11 rounded-md font-medium"
                            style={{ backgroundColor: '#FF4F4F', borderColor: '#FF4F4F' }}
                        >
                            Check in
                        </Button>
                    )}
                    {t.canCheckOut && (
                        <Button
                            block
                            onClick={open('out')}
                            className="h-11 rounded-md font-medium"
                            style={{ color: '#FF4F4F', borderColor: '#FF4F4F' }}
                        >
                            Check out
                        </Button>
                    )}
                    {t.hint && (
                        <Text className="text-xs text-center text-titleText">{t.hint}</Text>
                    )}
                </div>
            )}

            <PunchModal
                open={confirm !== null}
                mode={confirm ?? 'in'}
                loading={busy}
                onClose={() => setConfirm(null)}
                onConfirm={punch}
            />
        </div>
    );
};

export default TodayPunch;
