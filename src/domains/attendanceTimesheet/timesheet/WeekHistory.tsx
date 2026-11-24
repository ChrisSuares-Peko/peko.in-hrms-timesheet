// PROTOTYPE-SETUP: ESS Service 1 — a week's history (who, what, when, detail), newest first, collapsible.
import { Collapse, Timeline } from 'antd';

import { fmtStamp } from '../components/format';
import type { ActorRef, HistoryEvent } from '../types';
import { HISTORY_COLOR, HISTORY_LABEL } from './helpers';

const who = (a: ActorRef) => {
    if (a.role === 'SYSTEM') return 'System';
    if (a.role === 'EMPLOYEE') return a.name;
    return `${a.name} (${a.role === 'MANAGER' ? 'manager' : a.role})`;
};

export interface WeekHistoryProps {
    history: HistoryEvent[];
    defaultOpen?: boolean;
}

const WeekHistory = ({ history, defaultOpen }: WeekHistoryProps) => {
    const items = [...history].sort((a, b) => b.at.localeCompare(a.at));
    return (
        <Collapse
            size="small"
            className="bg-white"
            defaultActiveKey={defaultOpen ? ['history'] : []}
            items={[
                {
                    key: 'history',
                    label: (
                        <span className="text-sm font-medium">
                            History <span className="font-normal text-[var(--peko-muted)]">({items.length})</span>
                        </span>
                    ),
                    children: items.length ? (
                        <Timeline
                            className="!mt-2"
                            items={items.map((h, i) => ({
                                key: `${h.at}-${i}`,
                                color: HISTORY_COLOR[h.action],
                                children: (
                                    <div className="flex min-w-0 flex-col text-xs">
                                        <span className="text-sm text-[var(--peko-text)]">
                                            <span className="font-medium">{who(h.actor)}</span>{' '}
                                            {HISTORY_LABEL[h.action].toLowerCase()}
                                        </span>
                                        {h.detail && (
                                            <span className="break-words text-[var(--peko-text-2)]">{h.detail}</span>
                                        )}
                                        <span className="text-[var(--peko-muted)]">{fmtStamp(h.at)}</span>
                                    </div>
                                ),
                            }))}
                        />
                    ) : (
                        <span className="text-xs text-[var(--peko-muted)]">Nothing has happened in this timesheet yet.</span>
                    ),
                },
            ]}
        />
    );
};

export default WeekHistory;
