// PROTOTYPE-SETUP (Overview; ESS design, Slice 2; HR rules, Slice 2): section 2 — "Attendance" with "Open". The ESS
// status-block pattern (pin icon, bold status, date underneath) carries the day:
//   Not checked in · Shift 9:30 AM – 6:30 PM        (grey)
//   Checked in at 9:24 AM · 3h 12m                  (live; green on time, amber late)
//   On break since 1:05 PM · 3h 40m since check-in  (amber)
//   Checked out at 6:40 PM · 9h 16m at work         (done)
//   Still checked in from Wed, 14 Oct               (amber — an earlier day isn't checked out)
//   On casual leave / {holiday} / Weekly off        (blue / blue / grey)
// Under it, "N breaks today · total" with "Edit breaks" (today's breaks, edited directly). Three buttons, one use
// each for in / out: Check in (red until used, then grey "Checked in 9:24 AM"); Start break / End break (only while
// checked in, amber while on a break); Check out (red while checked in, then grey "Checked out 6:40 PM"). There's no
// automatic check-out: while an earlier day is still open, an amber note and "Check out from {date}" replace them
// (Check in disabled). A small note reminds to check out.
import { useState } from 'react';

import { Alert, Button, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';

import { ESS_BUTTON, ESS_CAPTION } from '@src/components/ess/essTokens';
import { EssCard, EssSectionHeading, EssStatusBlock, EssStatusTone } from '@src/components/ess/EssUi';
import { useAppDispatch } from '@src/hooks/store';
import { REMEMBER_CHECK_OUT_NOTE } from '@src/prototype/rules/attendance';
import { lateTodayNote } from '@src/prototype/rules/leavePolicy';
import { showToast } from '@src/slices/apiSlice';

import { checkIn, checkOut, checkOutPrevious, endBreak, startBreak } from '../api';
import LocationBar from './LocationBar';
import { displayTime, formatDuration } from '../components/format';
import BreaksModal from '../ess/BreaksModal';
import { secondsSince, useNow } from '../ess/ui';
import { useAtsScope } from '../hooks/useAtsScope';
import type { AtsOverview } from '../types';

const { Text } = Typography;

/** Minutes from check-in to check-out, or to now while still checked in (never negative). */
export const minutesAtWork = (t: Pick<AtsOverview['today'], 'date' | 'checkIn' | 'checkOut'>, now: number) => {
    if (!t.checkIn) return 0;
    if (t.checkOut) return Math.max(0, dayjs(`${t.date}T${t.checkOut}`).diff(dayjs(`${t.date}T${t.checkIn}`), 'minute'));
    return Math.floor(secondsSince(t.date, t.checkIn, now) / 60);
};

/** "Wed, 14 Oct" */
const dayShort = (iso: string) => dayjs(iso).format('ddd, D MMM');

/** The status block's title and tone. */
export const attendanceStrip = (t: AtsOverview['today'], now: number): { text: string; tone: EssStatusTone } => {
    if (t.openFrom && !t.checkIn) return { text: `Still checked in from ${dayShort(t.openFrom.date)}`, tone: 'late' };
    if (t.status === 'on-leave') return { text: `On ${(t.label ?? 'leave').toLowerCase()} today`, tone: 'info' };
    const worked = formatDuration(minutesAtWork(t, now));
    const running = t.breaks.find(b => !b.end);
    if (t.checkIn && !t.checkOut && running) return { text: `On break since ${displayTime(running.start)} · ${worked} since check-in`, tone: 'late' };
    if (t.checkIn && t.checkOut) return { text: `Checked out at ${displayTime(t.checkOut)} · ${worked} at work`, tone: 'done' };
    if (t.checkIn) {
        const late = t.lateMinutes > 0 || t.status === 'late';
        return { text: `Checked in at ${displayTime(t.checkIn)} · ${worked}`, tone: late ? 'late' : 'onTime' };
    }
    if (t.status === 'holiday') return { text: `${t.label ?? 'Holiday'} · Office closed`, tone: 'info' };
    if (t.status === 'weekly-off') return { text: 'Weekly off', tone: 'idle' };
    return { text: 'Not checked in', tone: 'idle' };
};

/** "1 break today · 45m" / "No breaks today" (a running break counts until now). */
export const breaksLine = (t: AtsOverview['today'], now: number) => {
    const nowMin = dayjs(now).hour() * 60 + dayjs(now).minute();
    const total = t.breaks.reduce((s, b) => {
        const [sh, sm] = b.start.split(':').map(Number);
        const end = b.end ? b.end.split(':').map(Number) : null;
        return s + Math.max(0, (end ? end[0] * 60 + end[1] : nowMin) - (sh * 60 + sm));
    }, 0);
    if (!t.breaks.length) return 'No breaks today';
    return `${t.breaks.length} break${t.breaks.length === 1 ? '' : 's'} today · ${formatDuration(total)}`;
};

const RED = { backgroundColor: '#FF4F4F', borderColor: '#FF4F4F', color: '#fff' };
const AMBER = { backgroundColor: '#FFFAEB', borderColor: '#F79009', color: '#B54708' };

/**
 * PROTOTYPE-SETUP (Attendance tab, Slice 1; HR rules, Slice 2): the status block, today's breaks, the buttons and
 * the note, shared by the Overview card and the Attendance tab's Today card. Returns siblings so the card's own
 * layout (gap, pinning) applies.
 */
export const AttendancePunch = ({
    overview,
    onOverview,
    pinActions = false,
}: {
    overview: AtsOverview;
    /** Check-in / check-out / breaks answer with a fresh overview. */
    onOverview: (next: AtsOverview) => void;
    /** PROTOTYPE-SETUP (Attendance final, Slice 1): push the buttons and note to the bottom of a taller card. */
    pinActions?: boolean;
}) => {
    const scope = useAtsScope();
    const dispatch = useAppDispatch();
    const [busy, setBusy] = useState<'in' | 'out' | 'break' | 'previous' | null>(null);
    const [editing, setEditing] = useState(false);
    const t = overview.today;
    const onClock = Boolean(t.checkIn) && !t.checkOut;
    const now = useNow(onClock, 30000);
    const strip = attendanceStrip(t, now);
    const toast = (description: string) => dispatch(showToast({ description, variant: 'success' }));

    const run = async (kind: 'in' | 'out' | 'break' | 'previous') => {
        setBusy(kind);
        let res: AtsOverview | false = false;
        if (kind === 'in') res = await checkIn(scope);
        else if (kind === 'out') res = await checkOut(scope);
        else if (kind === 'previous') res = await checkOutPrevious(scope);
        else res = t.onBreak ? await endBreak(scope) : await startBreak(scope);
        setBusy(null);
        if (!res) return;
        onOverview(res);
        const r = res.today;
        if (kind === 'in' && r.checkIn) toast(`Checked in at ${displayTime(r.checkIn)}`);
        if (kind === 'out' && r.checkOut) toast(`Checked out at ${displayTime(r.checkOut)}`);
        if (kind === 'break') {
            const last = r.breaks[r.breaks.length - 1];
            if (last) toast(r.onBreak ? `Break started at ${displayTime(last.start)}` : `Break ended at ${displayTime(last.end ?? last.start)}`);
        }
        if (kind === 'previous' && t.openFrom) {
            const at = dayjs().format('HH:mm');
            toast(`Checked out from ${dayShort(t.openFrom.date)} at ${displayTime(at)}. If that’s not when you left, request a correction.`);
        }
    };

    const sub = `${dayjs(t.date).format('dddd, D MMMM')} · Shift ${displayTime(overview.shift.start)} – ${displayTime(overview.shift.end)}`;

    // An earlier day still open: check out of it first (no automatic check-out).
    if (t.openFrom && !t.checkIn) {
        const from = dayShort(t.openFrom.date);
        return (
            <>
                <EssStatusBlock tone={strip.tone} title={strip.text} sub={sub} />
                <Alert
                    type="warning"
                    showIcon
                    data-open-session
                    message={
                        <span className="text-sm">
                            You’re still checked in from <b>{from}</b> (since {displayTime(t.openFrom.checkIn)}). Check out of that day before checking in today.
                        </span>
                    }
                />
                <div className={`flex flex-col gap-2 ${pinActions ? 'mt-auto' : ''}`} data-punch>
                    <Button block style={RED} className={ESS_BUTTON} loading={busy === 'previous'} onClick={() => run('previous')}>
                        Check out from {from}
                    </Button>
                    <Tooltip title="Check out from the previous day first">
                        <Button block disabled className={ESS_BUTTON}>
                            Check in
                        </Button>
                    </Tooltip>
                </div>
                <span className={ESS_CAPTION}>{REMEMBER_CHECK_OUT_NOTE}</span>
            </>
        );
    }

    let outTitle = t.hint;
    if (!t.checkIn) outTitle = 'Check in first';
    else if (t.checkOut) outTitle = `Checked out at ${displayTime(t.checkOut)}`;
    const canBreak = t.canStartBreak || t.canEndBreak;

    return (
        <>
            <EssStatusBlock tone={strip.tone} title={strip.text} sub={sub} />
            {/* PROTOTYPE-SETUP (Final batch, Slice 5): leave deducted for today's late check-in. */}
            {t.lateDeduction && t.lateDeduction.state !== 'reversed' && t.lateMinutes > 0 && (
                <span className="-mt-1 rounded-lg bg-[#FFFAEB] px-3 py-2 text-xs leading-4 text-[#93370D]" data-late-note>
                    {lateTodayNote(t.lateDeduction, formatDuration(t.lateMinutes))}
                </span>
            )}
            {/* PROTOTYPE-SETUP (Final batch, Slice 2): Attendance only mode — "Working from". */}
            {overview.mode === 'attendance' && <LocationBar overview={overview} onOverview={onOverview} />}
            {t.checkIn && (
                <div className="-mt-1 flex items-center justify-between gap-2 text-sm text-[#616161]" data-breaks-today>
                    <span>{breaksLine(t, now)}</span>
                    {t.breaks.length > 0 && (
                        <Button type="link" size="small" className="!h-auto !p-0" onClick={() => setEditing(true)}>
                            Edit breaks
                        </Button>
                    )}
                </div>
            )}
            <div className={`flex flex-col gap-2 ${pinActions ? 'mt-auto' : ''}`} data-punch>
                <Tooltip title={t.checkIn ? `Checked in at ${displayTime(t.checkIn)}` : t.hint}>
                    <Button block disabled={!t.canCheckIn} loading={busy === 'in'} style={t.canCheckIn ? RED : undefined} className={ESS_BUTTON} onClick={() => run('in')}>
                        {t.checkIn ? `Checked in ${displayTime(t.checkIn)}` : 'Check in'}
                    </Button>
                </Tooltip>
                <Tooltip title={canBreak ? undefined : 'Available while checked in'}>
                    <Button block disabled={!canBreak} loading={busy === 'break'} style={t.onBreak ? AMBER : undefined} className={ESS_BUTTON} onClick={() => run('break')}>
                        {t.onBreak ? 'End break' : 'Start break'}
                    </Button>
                </Tooltip>
                <Tooltip title={t.canCheckOut ? undefined : outTitle}>
                    <Button block disabled={!t.canCheckOut} loading={busy === 'out'} style={t.canCheckOut ? RED : undefined} className={ESS_BUTTON} onClick={() => run('out')}>
                        {t.checkOut ? `Checked out ${displayTime(t.checkOut)}` : 'Check out'}
                    </Button>
                </Tooltip>
            </div>
            <Text className={ESS_CAPTION}>{REMEMBER_CHECK_OUT_NOTE}</Text>
            <BreaksModal open={editing} overview={overview} onClose={() => setEditing(false)} onSaved={onOverview} />
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
    /** Check-in / check-out / breaks answer with a fresh overview. */
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
