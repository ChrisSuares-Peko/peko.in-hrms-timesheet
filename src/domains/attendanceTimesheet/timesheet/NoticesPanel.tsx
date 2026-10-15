// PROTOTYPE-SETUP (HR rules, Slice 3): the Timesheet tab's Notices panel (35% next to the calendar; the same height,
// scrolling inside — timesheet.css). From the prototype:
//   Week of {date}       the focused week's status Tag, its status line and its action (Resubmit / Request a change /
//                        Show my changes · Withdraw / Send change · Discard) — WeekStatusCard, bare
//   Needs your action    across ALL weeks (not the focused one), with a red "N to do" in the header: another
//                        sent-back week / a week with a change waiting → "Open week"; still checked in from an earlier
//                        day → "Go to attendance"; unclaimed overtime → "Review overtime" (the Overtime tab)
//   Unlogged hours       "{date} · {logged} logged · {gap} missing", clickable, max 5
//   History              collapsed to "Show N events"
import { ReactNode, useState } from 'react';

import { RightOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import dayjs from 'dayjs';

import { ESS_CARD } from '@src/components/ess/essTokens';
import { formatDuration } from '@src/prototype/rules/attendance';

import { displayTime, fmtStamp } from '../components/format';
import type { ActorRef, AtsTab, HistoryEvent, TimesheetNotices } from '../types';
import { HISTORY_LABEL } from './helpers';
import { UnloggedDay, unloggedDays } from './UnloggedHoursCard';

const MAX_UNLOGGED = 5;

interface Notice {
    id: string;
    tone: 'back' | 'info' | 'amber';
    title: string;
    text: string;
    button: string;
    go: () => void;
}

const TONE: Record<Notice['tone'], string> = {
    back: 'bg-[#FFF1E6] text-[#7A3E00]',
    info: 'bg-[#EEF3FF] text-[#1D3F9E]',
    amber: 'bg-[#FFFAEB] text-[#93370D]',
};

const Group = ({ children }: { children: ReactNode }) => (
    <div className="mx-1.5 mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wide text-[#9e9e9e]">{children}</div>
);

const who = (a: ActorRef) => (a.role === 'SYSTEM' ? 'System' : a.name);

/** "Week of 21 Sep" style dates. */
const dm = (iso: string) => dayjs(iso).format('D MMM');

export interface NoticesPanelProps {
    /** The focused week's block (status Tag, line, action). */
    week: ReactNode;
    focusWeekStart: string;
    notices: TimesheetNotices | null;
    unlogged: UnloggedDay[] | null;
    today: string;
    period: 'day' | 'week' | 'month';
    history: HistoryEvent[] | null;
    onOpenWeek: (weekStart: string) => void;
    onGoTab?: (tab: AtsTab) => void;
    onPickDay: (date: string) => void;
}

const NoticesPanel = ({ week, focusWeekStart, notices, unlogged, today, period, history, onOpenWeek, onGoTab, onPickDay }: NoticesPanelProps) => {
    const [showHistory, setShowHistory] = useState(false);
    const items: Notice[] = [];
    (notices?.weeks ?? [])
        .filter(w => w.weekStart !== focusWeekStart)
        .forEach(w =>
            items.push(
                w.kind === 'sent-back'
                    ? { id: `sb-${w.weekStart}`, tone: 'back', title: `Week of ${dm(w.weekStart)} sent back`, text: w.text, button: 'Open week', go: () => onOpenWeek(w.weekStart) }
                    : { id: `ch-${w.weekStart}`, tone: 'info', title: `Change waiting · week of ${dm(w.weekStart)}`, text: w.text, button: 'Open week', go: () => onOpenWeek(w.weekStart) }
            )
        );
    if (notices?.openFrom && onGoTab) {
        items.push({
            id: 'open',
            tone: 'info',
            title: `Still checked in from ${dayjs(notices.openFrom.date).format('ddd, D MMM')}`,
            text: `Since ${displayTime(notices.openFrom.checkIn)}. Check out of that day before you check in today, then request a correction if needed.`,
            button: 'Go to attendance',
            go: () => onGoTab('attendance'),
        });
    }
    if (notices?.overtime && onGoTab) {
        const { days, minutes } = notices.overtime;
        items.push({
            id: 'ot',
            tone: 'amber',
            title: `${formatDuration(minutes)} of overtime not claimed`,
            text: `${days} day${days === 1 ? '' : 's'} beyond your standard hours.`,
            button: 'Review overtime',
            go: () => onGoTab('overtime'),
        });
    }
    const missing = unlogged ? unloggedDays(unlogged, today) : [];
    const events = history ? [...history].sort((a, b) => b.at.localeCompare(a.at)) : [];

    return (
        <div className="ts-notices min-w-0">
            <section aria-label="Notices" className={`ts-notices-in ${ESS_CARD} !pb-3`}>
                <div className="mb-1 flex items-center gap-2">
                    <h3 className="m-0 text-base font-medium text-gray-900">Notices</h3>
                    <span className="flex-1" />
                    {items.length > 0 && (
                        <Tag color="red" className="!m-0" data-todo-count>
                            {items.length} to do
                        </Tag>
                    )}
                </div>
                <div className="ts-notices-body -mx-1.5 px-1.5" data-notices-body>
                    <div className="rounded-xl border border-solid border-gray-100 px-3 py-2.5">{week}</div>

                    {items.length > 0 && <Group>Needs your action</Group>}
                    {items.map(x => (
                        <div key={x.id} className={`mb-1.5 flex items-start justify-between gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${TONE[x.tone]}`} data-notice={x.id}>
                            <div className="min-w-0">
                                <b className="block font-medium">{x.title}</b>
                                <span className="block break-words text-xs opacity-90">{x.text}</span>
                            </div>
                            <Button size="small" className="shrink-0" onClick={x.go}>
                                {x.button}
                            </Button>
                        </div>
                    ))}

                    <Group>Unlogged hours</Group>
                    {unlogged && missing.length > 0 ? (
                        <div className="px-1.5">
                            {missing.slice(0, MAX_UNLOGGED).map(d => (
                                <button
                                    key={d.date}
                                    type="button"
                                    onClick={() => onPickDay(d.date)}
                                    className="flex w-full cursor-pointer items-center justify-between gap-2 border-0 border-b border-solid border-gray-100 bg-transparent px-0 py-[7px] text-left text-[13px] text-gray-900 last:border-b-0 hover:text-blue-600"
                                    data-unlogged={d.date}
                                >
                                    <span className="min-w-0">
                                        {dayjs(d.date).format('ddd, D MMM')}
                                        <span className="text-xs text-gray-500"> · {formatDuration(d.loggedMinutes)} logged</span>
                                    </span>
                                    <span className="whitespace-nowrap text-amber-700">
                                        {formatDuration(d.gap)} missing <RightOutlined className="text-[10px]" />
                                    </span>
                                </button>
                            ))}
                            {missing.length > MAX_UNLOGGED && <div className="text-xs text-gray-500">and {missing.length - MAX_UNLOGGED} more</div>}
                        </div>
                    ) : (
                        <div className="px-1.5 pb-2 text-xs text-gray-500">Nothing missing in this {period}, after breaks.</div>
                    )}

                    {events.length > 0 && (
                        <>
                            <Group>History</Group>
                            <div className="px-1.5">
                                <Button type="link" size="small" className="!h-auto !p-0 !text-xs" onClick={() => setShowHistory(v => !v)}>
                                    {showHistory ? 'Hide' : 'Show'} {events.length} event{events.length === 1 ? '' : 's'}
                                </Button>
                                {showHistory && (
                                    <ul className="m-0 mt-1.5 list-none p-0">
                                        {events.map((h, i) => (
                                            <li key={`${h.at}-${i}`} className="grid grid-cols-[86px_minmax(0,1fr)] gap-2.5 border-0 border-b border-solid border-gray-100 py-1.5 text-xs last:border-b-0">
                                                <span className="text-gray-400">{fmtStamp(h.at)}</span>
                                                <span className="break-words text-gray-700">
                                                    <b className="font-medium">{who(h.actor)}</b>: {HISTORY_LABEL[h.action]}
                                                    {h.detail ? ` — ${h.detail}` : ''}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
};

export default NoticesPanel;
