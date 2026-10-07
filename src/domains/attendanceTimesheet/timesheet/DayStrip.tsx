// PROTOTYPE-SETUP: ESS Service 1 — the Day view's 7-day strip (Mon–Sun of the selected week with each day's
// logged hours) and prev / next week arrows. Only the strip itself scrolls sideways, never the page.
import { useEffect, useRef } from 'react';

import { LeftOutlined, RightOutlined, WarningFilled } from '@ant-design/icons';
import { Button } from 'antd';
import dayjs from 'dayjs';

import type { TimesheetDay } from '../types';
import { shortHours } from './helpers';

export interface DayStripProps {
    days: TimesheetDay[];
    selected: string;
    today: string;
    onSelect: (date: string) => void;
    onPrevWeek: () => void;
    onNextWeek: () => void;
}

const DayStrip = ({ days, selected, today, onSelect, onPrevWeek, onNextWeek }: DayStripProps) => {
    const scroller = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Scroll only the strip (never the page) so the selected day is centred.
        const box = scroller.current;
        const el = box?.querySelector<HTMLElement>('[data-selected="true"]');
        if (box && el) box.scrollLeft = el.offsetLeft - (box.clientWidth - el.clientWidth) / 2;
    }, [selected, days]);

    return (
        <div className="flex w-full min-w-0 items-center gap-1">
            <Button type="text" size="small" icon={<LeftOutlined />} aria-label="Previous week" onClick={onPrevWeek} />
            <div ref={scroller} className="relative flex min-w-0 flex-1 snap-x gap-1.5 overflow-x-auto pb-1">
                {days.map(d => {
                    const isSel = d.date === selected;
                    const nothing = d.unloggedMinutes > 0 && d.loggedMinutes === 0;
                    let tone = 'border-gray-200 bg-white text-gray-800';
                    if (d.window.kind === 'none') tone = 'border-gray-200 bg-gray-50 text-gray-500';
                    if (isSel) tone = 'border-blue-500 bg-blue-500 text-white';
                    return (
                        <button
                            key={d.date}
                            type="button"
                            data-selected={isSel}
                            aria-pressed={isSel}
                            aria-label={`${dayjs(d.date).format('dddd D MMMM')}, ${shortHours(d.loggedMinutes)} logged`}
                            onClick={() => onSelect(d.date)}
                            className={`relative flex min-w-[52px] flex-1 cursor-pointer snap-center flex-col items-center rounded-lg border border-solid px-1 py-1.5 ${tone}`}
                        >
                            <span className="text-[11px] uppercase leading-4 opacity-80">
                                {dayjs(d.date).format('ddd')}
                            </span>
                            <span className="text-base font-semibold leading-5">{dayjs(d.date).format('D')}</span>
                            <span
                                className={`text-[11px] tabular-nums leading-4 ${
                                    nothing && !isSel ? 'text-amber-600' : ''
                                }`}
                            >
                                {d.loggedMinutes ? shortHours(d.loggedMinutes) : '–'}
                            </span>
                            {d.date === today && !isSel && (
                                <span className="absolute left-1/2 top-0.5 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-500" />
                            )}
                            {d.outsideCheckIn && (
                                <WarningFilled
                                    className={`absolute right-1 top-1 text-[9px] ${isSel ? 'text-white' : 'text-amber-500'}`}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
            <Button type="text" size="small" icon={<RightOutlined />} aria-label="Next week" onClick={onNextWeek} />
        </div>
    );
};

export default DayStrip;
