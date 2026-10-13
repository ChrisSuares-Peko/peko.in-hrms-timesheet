// PROTOTYPE-SETUP: ESS Service 1 — small layout pieces shared by the ESS Attendance & Timesheet screens
// (panels, stat tiles, a ticking clock and the "time at work" timer).
import { ReactNode, useEffect, useState } from 'react';

import { Typography } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD, ESS_SECTION_TITLE } from '@src/components/ess/essTokens';

const { Text } = Typography;

/** White rounded panel, the card style used across the ESS pages (ESS design: 32px card, 18px section title). */
export const Panel = ({
    title,
    subtitle,
    extra,
    children,
    className = '',
}: {
    title?: ReactNode;
    subtitle?: ReactNode;
    extra?: ReactNode;
    children: ReactNode;
    className?: string;
}) => (
    // PROTOTYPE-SETUP (ESS design, Slice 3): the ESS card (32px radius, soft shadow) and section heading.
    <section className={`${ESS_CARD} min-w-0 ${className}`}>
        {(title || extra) && (
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div className="min-w-0">
                    {title && <Text className={`block ${ESS_SECTION_TITLE}`}>{title}</Text>}
                    {subtitle && <Text className="block text-xs text-[#9e9e9e]">{subtitle}</Text>}
                </div>
                {extra}
            </div>
        )}
        {children}
    </section>
);

/** A labelled number, e.g. "Present · 14". */
export const StatTile = ({
    label,
    value,
    tone = 'bg-[#F7F7F7]',
    hint,
}: {
    label: string;
    value: ReactNode;
    tone?: string;
    hint?: ReactNode;
}) => (
    <div className={`rounded-2xl px-4 py-3 min-w-0 ${tone}`}>
        <div className="text-lg sm:text-xl font-semibold leading-tight text-[#080808] tabular-nums">{value}</div>
        <Text className="block text-xs text-[#616161] leading-snug">{label}</Text>
        {hint && <Text className="block text-[11px] text-[#9e9e9e] leading-snug">{hint}</Text>}
    </div>
);

/** Current time, re-rendering every `intervalMs` while `enabled`. */
export const useNow = (enabled: boolean, intervalMs = 1000) => {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!enabled) return undefined;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [enabled, intervalMs]);
    return now;
};

/** Seconds since `date` `time` ("HH:mm"), never negative. */
export const secondsSince = (date: string, time: string, now: number) =>
    Math.max(0, Math.floor((now - dayjs(`${date}T${time}`).valueOf()) / 1000));

/** 8145 → "02:15:45" */
export const fmtClock = (seconds: number) =>
    [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
        .map(n => String(n).padStart(2, '0'))
        .join(':');

/** Today as YYYY-MM-DD (local). */
export const todayIso = () => dayjs().format('YYYY-MM-DD');
