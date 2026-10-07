// PROTOTYPE-SETUP: ESS Service 1 — small layout pieces shared by the ESS Attendance & Timesheet screens
// (panels, stat tiles, a ticking clock and the "time at work" timer).
import { ReactNode, useEffect, useState } from 'react';

import { Typography } from 'antd';
import dayjs from 'dayjs';

const { Text } = Typography;

/** White rounded panel, the card style used across the ESS pages. */
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
    <section
        className={`bg-white border border-gray-100 rounded-2xl shadow-sm p-4 sm:p-5 min-w-0 ${className}`}
    >
        {(title || extra) && (
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div className="min-w-0">
                    {title && (
                        <Text className="block text-base font-semibold text-valueText">{title}</Text>
                    )}
                    {subtitle && <Text className="block text-xs text-titleText">{subtitle}</Text>}
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
    tone = 'bg-[#F7F9FB]',
    hint,
}: {
    label: string;
    value: ReactNode;
    tone?: string;
    hint?: ReactNode;
}) => (
    <div className={`rounded-xl px-3 py-3 min-w-0 ${tone}`}>
        <div className="text-lg sm:text-xl font-semibold leading-tight text-valueText tabular-nums">
            {value}
        </div>
        <Text className="block text-xs text-[#616161] leading-snug">{label}</Text>
        {hint && <Text className="block text-[11px] text-titleText leading-snug">{hint}</Text>}
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
