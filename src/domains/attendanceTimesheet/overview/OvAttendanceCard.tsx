// PROTOTYPE-SETUP (Overview, Slice 2; decluttered in Overview v2, Slice 2): section 2 — today's attendance.
// One status strip carries everything:
//   Not checked in · Shift 09:30–18:30            (grey)
//   Checked in at 09:24 · 3h 12m                   (live; green on time, amber late)
//   Checked out at 18:40 · 9h 16m at work          (green)
//   On casual leave / {holiday} / Weekly off       (blue / blue / grey)
// Both buttons stay, one use each per day: Check in is red until used, then grey "Checked in 09:24"; Check out
// is grey until checked in, red while checked in, then grey "Checked out 18:40".
import { useState } from 'react';

import { Button, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';

import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { OvCard } from './OvCard';
import { checkIn, checkOut } from '../api';
import { formatDuration } from '../components/format';
import { secondsSince, useNow } from '../ess/ui';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsOverview } from '../types';

const { Text } = Typography;

type Tone = 'green' | 'amber' | 'blue' | 'grey';

const TONE: Record<Tone, { bg: string; fg: string }> = {
    green: { bg: '#E7F8EE', fg: '#067647' },
    amber: { bg: '#FFF6E0', fg: '#93370D' },
    blue: { bg: '#EEF3FF', fg: '#1D3F9E' },
    grey: { bg: '#F0F2F5', fg: '#475467' },
};

/** Minutes from check-in to check-out, or to now while still checked in (never negative). */
export const minutesAtWork = (t: Pick<AtsOverview['today'], 'date' | 'checkIn' | 'checkOut'>, now: number) => {
    if (!t.checkIn) return 0;
    if (t.checkOut) return Math.max(0, dayjs(`${t.date}T${t.checkOut}`).diff(dayjs(`${t.date}T${t.checkIn}`), 'minute'));
    return Math.floor(secondsSince(t.date, t.checkIn, now) / 60);
};

/** The status strip's text and colour. */
export const attendanceStrip = (t: AtsOverview['today'], shift: { start: string; end: string }, now: number): { text: string; tone: Tone } => {
    if (t.status === 'on-leave') return { text: `On ${(t.label ?? 'leave').toLowerCase()}`, tone: 'blue' };
    if (t.status === 'holiday' && !t.checkIn) return { text: t.label ?? 'Holiday', tone: 'blue' };
    if (t.status === 'weekly-off' && !t.checkIn) return { text: 'Weekly off', tone: 'grey' };
    const worked = formatDuration(minutesAtWork(t, now));
    if (t.checkIn && t.checkOut) return { text: `Checked out at ${t.checkOut} · ${worked} at work`, tone: 'green' };
    if (t.checkIn) {
        const late = t.lateMinutes > 0 || t.status === 'late';
        return { text: `Checked in at ${t.checkIn} · ${worked}`, tone: late ? 'amber' : 'green' };
    }
    return { text: `Not checked in · Shift ${shift.start}–${shift.end}`, tone: 'grey' };
};

const RED = { backgroundColor: '#FF4F4F', borderColor: '#FF4F4F', color: '#fff' };

const OvAttendanceCard = ({
    overview,
    onOverview,
    openPath,
    className,
}: {
    overview: AtsOverview;
    /** Check-in / check-out answer with a fresh overview. */
    onOverview: (next: AtsOverview) => void;
    /** The Attendance tab. */
    openPath: string;
    className?: string;
}) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [busy, setBusy] = useState<'in' | 'out' | null>(null);
    const t = overview.today;
    const onClock = Boolean(t.checkIn) && !t.checkOut;
    const now = useNow(onClock);
    const strip = attendanceStrip(t, overview.shift, now);
    const tone = TONE[strip.tone];

    const punch = async (kind: 'in' | 'out') => {
        setBusy(kind);
        const res = kind === 'in' ? await checkIn(scope) : await checkOut(scope);
        setBusy(null);
        if (!res) return;
        onOverview(res);
        const time = kind === 'in' ? res.today.checkIn : res.today.checkOut;
        dispatch(showToast({ description: `${kind === 'in' ? 'Checked in' : 'Checked out'} at ${time}`, variant: 'success' }));
    };

    let outTitle = t.hint;
    if (!t.checkIn) outTitle = 'Check in first';
    else if (t.checkOut) outTitle = `Checked out at ${t.checkOut}`;

    return (
        <OvCard
            label="Attendance today"
            title="Attendance"
            sub={dayjs(t.date).format('dddd, D MMMM')}
            link={{ to: openPath, text: 'Open ›' }}
            className={className}
        >
            <div
                role="status"
                className="rounded-xl px-3 py-2.5 text-sm font-semibold tabular-nums"
                style={{ backgroundColor: tone.bg, color: tone.fg }}
            >
                {strip.text}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Tooltip title={t.checkIn ? `Checked in at ${t.checkIn}` : t.hint}>
                    <Button
                        block
                        disabled={!t.canCheckIn}
                        loading={busy === 'in'}
                        style={t.canCheckIn ? RED : undefined}
                        className="h-10 font-medium"
                        onClick={() => punch('in')}
                    >
                        {t.checkIn ? `Checked in ${t.checkIn}` : 'Check in'}
                    </Button>
                </Tooltip>
                <Tooltip title={t.canCheckOut ? undefined : outTitle}>
                    <Button
                        block
                        disabled={!t.canCheckOut}
                        loading={busy === 'out'}
                        style={t.canCheckOut ? RED : undefined}
                        className="h-10 font-medium"
                        onClick={() => punch('out')}
                    >
                        {t.checkOut ? `Checked out ${t.checkOut}` : 'Check out'}
                    </Button>
                </Tooltip>
            </div>
            <Text className="text-xs text-gray-500">Auto check-out at 11:59 PM if you forget.</Text>
        </OvCard>
    );
};

export default OvAttendanceCard;
