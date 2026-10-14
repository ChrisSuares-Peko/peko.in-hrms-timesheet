// PROTOTYPE-SETUP (Overview; ESS design, Slice 2): section 2 — "Attendance" with "Open". The ESS status-block
// pattern (pin icon, bold status, date underneath) carries everything:
//   Not checked in                                  (grey)
//   Checked in at 09:24 · 3h 12m                     (live; green on time, amber late)
//   Checked out at 18:40 · 9h 16m at work            (done)
//   On casual leave / {holiday} / Weekly off         (blue / blue / grey)
// Both buttons full width, styled like the ESS Check In button, one use each per day: Check in is red until used,
// then grey "Checked in 09:24"; Check out is grey until checked in, red while checked in, then grey "Checked out
// 18:40". A small grey caption explains the automatic check-out.
import { useState } from 'react';

import { Button, Tooltip } from 'antd';
import dayjs from 'dayjs';

import { ESS_BUTTON, ESS_CAPTION } from '@src/components/ess/essTokens';
import { EssCard, EssSectionHeading, EssStatusBlock, EssStatusTone } from '@src/components/ess/EssUi';
import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { checkIn, checkOut } from '../api';
import { formatDuration } from '../components/format';
import { secondsSince, useNow } from '../ess/ui';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsOverview } from '../types';

/** Minutes from check-in to check-out, or to now while still checked in (never negative). */
export const minutesAtWork = (t: Pick<AtsOverview['today'], 'date' | 'checkIn' | 'checkOut'>, now: number) => {
    if (!t.checkIn) return 0;
    if (t.checkOut) return Math.max(0, dayjs(`${t.date}T${t.checkOut}`).diff(dayjs(`${t.date}T${t.checkIn}`), 'minute'));
    return Math.floor(secondsSince(t.date, t.checkIn, now) / 60);
};

/** The status block's title and tone. */
export const attendanceStrip = (t: AtsOverview['today'], now: number): { text: string; tone: EssStatusTone } => {
    if (t.status === 'on-leave') return { text: `On ${(t.label ?? 'leave').toLowerCase()}`, tone: 'info' };
    if (t.status === 'holiday' && !t.checkIn) return { text: t.label ?? 'Holiday', tone: 'info' };
    if (t.status === 'weekly-off' && !t.checkIn) return { text: 'Weekly off', tone: 'idle' };
    const worked = formatDuration(minutesAtWork(t, now));
    if (t.checkIn && t.checkOut) return { text: `Checked out at ${t.checkOut} · ${worked} at work`, tone: 'done' };
    if (t.checkIn) {
        const late = t.lateMinutes > 0 || t.status === 'late';
        return { text: `Checked in at ${t.checkIn} · ${worked}`, tone: late ? 'late' : 'onTime' };
    }
    return { text: 'Not checked in', tone: 'idle' };
};

const RED = { backgroundColor: '#FF4F4F', borderColor: '#FF4F4F', color: '#fff' };

/**
 * PROTOTYPE-SETUP (Attendance tab, Slice 1): the status block, the Check in / Check out buttons and the caption,
 * shared by the Overview card and the Attendance tab's Today card. Returns siblings so the card's own layout
 * (gap, spreading at a fixed height) applies.
 */
export const AttendancePunch = ({
    overview,
    onOverview,
    pinActions = false,
}: {
    overview: AtsOverview;
    /** Check-in / check-out answer with a fresh overview. */
    onOverview: (next: AtsOverview) => void;
    /** PROTOTYPE-SETUP (Attendance final, Slice 1): push the buttons and note to the bottom of a taller card. */
    pinActions?: boolean;
}) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [busy, setBusy] = useState<'in' | 'out' | null>(null);
    const t = overview.today;
    const onClock = Boolean(t.checkIn) && !t.checkOut;
    const now = useNow(onClock);
    const strip = attendanceStrip(t, now);

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
        <>
            <EssStatusBlock
                tone={strip.tone}
                title={strip.text}
                sub={`${dayjs(t.date).format('dddd, D MMMM')} · Shift ${overview.shift.start}–${overview.shift.end}`}
            />
            <div className={`flex flex-col gap-2 ${pinActions ? 'mt-auto' : ''}`}>
                <Tooltip title={t.checkIn ? `Checked in at ${t.checkIn}` : t.hint}>
                    <Button block disabled={!t.canCheckIn} loading={busy === 'in'} style={t.canCheckIn ? RED : undefined} className={ESS_BUTTON} onClick={() => punch('in')}>
                        {t.checkIn ? `Checked in ${t.checkIn}` : 'Check in'}
                    </Button>
                </Tooltip>
                <Tooltip title={t.canCheckOut ? undefined : outTitle}>
                    <Button block disabled={!t.canCheckOut} loading={busy === 'out'} style={t.canCheckOut ? RED : undefined} className={ESS_BUTTON} onClick={() => punch('out')}>
                        {t.checkOut ? `Checked out ${t.checkOut}` : 'Check out'}
                    </Button>
                </Tooltip>
            </div>
            <span className={ESS_CAPTION}>Auto check-out at 11:59 PM if you forget.</span>
        </>
    );
};

const OvAttendanceCard = ({
    overview,
    onOverview,
    openPath,
    className = '',
}: {
    overview: AtsOverview;
    /** Check-in / check-out answer with a fresh overview. */
    onOverview: (next: AtsOverview) => void;
    /** The Attendance tab. */
    openPath: string;
    className?: string;
}) => (
    // PROTOTYPE-SETUP (Overview v5, Slice 1): the parts keep the card's normal gaps (no spreading to fill the row).
    <EssCard label="Attendance today" heading={<EssSectionHeading title="Attendance" link={{ to: openPath, text: 'Open' }} />} className={className}>
        <AttendancePunch overview={overview} onOverview={onOverview} />
    </EssCard>
);

export default OvAttendanceCard;
