// PROTOTYPE-SETUP (Overview, Slice 2): section 2 — today's attendance (prototype "OvAttendance").
// Date and shift; a status strip (Not checked in / Checked in on time / Checked in late / Checked out / On leave /
// Holiday / Weekly off) with a running timer; Check in / Check out / At work cells; and both buttons, always
// visible. One check-in and one check-out per day: Check in is red until used, then grey "Checked in 09:24";
// Check out is grey until checked in, red while checked in, then grey "Checked out 18:40".
import { useState } from 'react';

import { Button, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';

import { useAppDispatch } from '@src/hooks/store';
import { AUTO_CHECK_OUT_NOTE } from '@src/prototype/rules/attendance';
import { showToast } from '@src/slices/apiSlice';

import { OvCard } from './OvCard';
import { checkIn, checkOut } from '../api';
import { formatDuration } from '../components/format';
import { fmtClock, secondsSince, useNow } from '../ess/ui';
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

/** The status strip's headline and colour. */
export const attendanceHeadline = (t: AtsOverview['today']): { text: string; tone: Tone } => {
    if (t.status === 'on-leave') return { text: `On ${(t.label ?? 'leave').toLowerCase()}`, tone: 'blue' };
    if (t.status === 'holiday' && !t.checkIn) return { text: t.label ?? 'Holiday', tone: 'blue' };
    if (t.status === 'weekly-off' && !t.checkIn) return { text: 'Weekly off', tone: 'grey' };
    if (t.checkOut) return { text: 'Checked out', tone: 'green' };
    if (t.checkIn && (t.lateMinutes > 0 || t.status === 'late')) return { text: 'Checked in late', tone: 'amber' };
    if (t.checkIn) return { text: 'Checked in on time', tone: 'green' };
    return { text: 'Not checked in', tone: 'grey' };
};

const RED = { backgroundColor: '#FF4F4F', borderColor: '#FF4F4F', color: '#fff' };

const Cell = ({ label, value }: { label: string; value: string }) => (
    <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-titleText">{label}</div>
        <div className="truncate text-sm font-semibold tabular-nums text-valueText">{value}</div>
    </div>
);

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
    const headline = attendanceHeadline(t);
    const tone = TONE[headline.tone];

    let atWorkSeconds = 0;
    if (t.checkIn && t.checkOut) atWorkSeconds = Math.max(0, dayjs(`${t.date}T${t.checkOut}`).diff(dayjs(`${t.date}T${t.checkIn}`), 'second'));
    else if (t.checkIn) atWorkSeconds = secondsSince(t.date, t.checkIn, now);
    const atWork = formatDuration(Math.floor(atWorkSeconds / 60));
    const timer = onClock ? fmtClock(atWorkSeconds) : atWork;

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
            sub={`${dayjs(t.date).format('dddd, D MMMM')} · Shift ${overview.shift.start}–${overview.shift.end}`}
            link={{ to: openPath, text: 'Open ›' }}
            className={className}
        >
            <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ backgroundColor: tone.bg, color: tone.fg }}>
                <Text className="min-w-0 truncate text-sm font-semibold" style={{ color: tone.fg }}>
                    {headline.text}
                </Text>
                <b className="shrink-0 text-xl font-semibold tabular-nums" title="Time at work so far">
                    {t.checkIn ? timer : '0h'}
                </b>
            </div>
            <div className="grid grid-cols-3 gap-2">
                <Cell label="Check in" value={t.checkIn ?? '—'} />
                <Cell label="Check out" value={t.checkOut ?? '—'} />
                <Cell label="At work" value={t.checkIn ? atWork : '—'} />
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
            <Text className="text-xs text-titleText">{AUTO_CHECK_OUT_NOTE}</Text>
        </OvCard>
    );
};

export default OvAttendanceCard;
