// PROTOTYPE-SETUP (Overview; decluttered in Overview v2; ESS design, Slice 2): section 5 — "Notifications" with the
// to-do count, in the ESS AnnouncementsPanel container (grey 32px panel, white rounded items):
//   Needs your action  all of them, as List items (button on the right, under the text), keeping their tints
//   Your requests      the latest 3 with a status dot, plus "View all" (the requests' page when they're all one
//                      kind, else Leaves)
//   the announcement   one line at the bottom ("Office closed for {holiday} on {date}"), "N more" expands the rest
// antd Empty when there's nothing to show.
import { useState } from 'react';

import { Badge, Button, Empty, List } from 'antd';
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';

import { ESS_GROUP_LABEL, ESS_PANEL, ESS_SECTION_LINK } from '@src/components/ess/essTokens';
import { EssSectionHeading } from '@src/components/ess/EssUi';

import type { EssHomeView, OverviewLink, OverviewRequest } from '../types';

const TONE = {
    back: 'bg-[#FFF4E8] border-[#FFD9A8]',
    info: 'bg-[#EEF3FF] border-[#C9D7FF]',
    amber: 'bg-[#FFF6E0] border-[#FCE3A6]',
} as const;

const DOT = { pending: 'bg-[#2E62E8]', approved: 'bg-[#43B75D]', rejected: 'bg-[#FF4F4F]' } as const;

const SHOWN_REQUESTS = 3;

/** "View all": the requests' own page when they're all one kind, else Leaves. */
export const viewAllLink = (requests: OverviewRequest[]): OverviewLink => {
    const kinds = new Set(requests.map(r => r.type));
    if (kinds.size !== 1) return { page: 'leaves' };
    const [kind] = [...kinds];
    if (kind === 'reimbursement') return { page: 'reimbursements' };
    if (kind === 'profile') return { page: 'profile' };
    if (kind === 'overtime' || kind === 'attendance') return { tab: kind };
    return { page: 'leaves' };
};

const Group = ({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) => (
    <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2">
            <h4 className={`m-0 ${ESS_GROUP_LABEL}`}>{title}</h4>
            <span className="flex-1" />
            {extra}
        </div>
        {children}
    </div>
);

const OvNotifications = ({
    home,
    hrefOf,
    className = '',
}: {
    home: EssHomeView;
    hrefOf: (link: OverviewLink) => string;
    className?: string;
}) => {
    const navigate = useNavigate();
    const [allNews, setAllNews] = useState(false);
    const { actions, requests, announcements } = home;
    const [first, ...rest] = announcements;
    const firstLine = first?.date ? `${first.title} on ${dayjs(first.date).format('ddd D MMM')}` : first?.title;
    const nothing = !actions.length && !requests.length && !first;

    return (
        <section aria-label="Notifications" className={`flex min-w-0 flex-col gap-5 ${ESS_PANEL} ${className}`}>
            <EssSectionHeading
                title="Notifications"
                extra={actions.length > 0 && <Badge count={`${actions.length} to do`} style={{ backgroundColor: '#FF4F4F' }} />}
            />
            {nothing && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="You're all caught up" />}
            {actions.length > 0 && (
                <Group title="Needs your action">
                    <List
                        split={false}
                        dataSource={actions}
                        rowKey={a => `${a.kind}-${a.title}`}
                        renderItem={a => (
                            <List.Item className={`!mb-2 !flex-col !items-stretch !gap-2 rounded-2xl border border-solid !px-4 !py-3 last:!mb-0 ${TONE[a.tone]}`}>
                                <div className="min-w-0">
                                    <b className="block text-sm font-semibold text-[#080808]">{a.title}</b>
                                    <span className="block text-xs text-[#616161]">{a.text}</span>
                                </div>
                                <Button size="small" className="h-8 self-end px-3" onClick={() => navigate(hrefOf(a.link))}>
                                    {a.button}
                                </Button>
                            </List.Item>
                        )}
                    />
                </Group>
            )}
            {requests.length > 0 && (
                <Group
                    title="Your requests"
                    extra={
                        <Link to={hrefOf(viewAllLink(requests))} className={`text-xs ${ESS_SECTION_LINK}`}>
                            View all
                        </Link>
                    }
                >
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {requests.slice(0, SHOWN_REQUESTS).map(r => (
                            <li key={`${r.type}-${r.id}`}>
                                <button
                                    type="button"
                                    onClick={() => navigate(hrefOf(r.link))}
                                    className="flex w-full cursor-pointer items-start gap-3 rounded-2xl border-0 bg-white px-4 py-3 text-left transition-shadow hover:shadow-sm"
                                >
                                    <span aria-hidden className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${DOT[r.state]}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium text-[#080808]">
                                            {r.title} <span className="font-normal text-[#616161]">{r.detail}</span>
                                        </span>
                                        <span className="block text-xs text-[#9e9e9e]">{r.statusText}</span>
                                    </span>
                                    <span className="shrink-0 rounded-full bg-[#ecfdf3] px-2.5 py-0.5 text-xs font-medium text-[#027a48]">
                                        {dayjs(r.at).format('D MMM')}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </Group>
            )}
            {first && (
                <div aria-label="Announcements" className="flex flex-col gap-2 rounded-2xl bg-white px-4 py-3">
                    <div className="flex items-baseline gap-2 text-sm">
                        <span aria-hidden className="inline-block h-3 w-[3px] shrink-0 self-center rounded bg-[#FF4F4F]" />
                        <span className="min-w-0 flex-1 text-[#080808]">{firstLine}</span>
                        {rest.length > 0 && (
                            <Button type="link" size="small" className="!h-auto !p-0 !text-xs" onClick={() => setAllNews(v => !v)} aria-expanded={allNews}>
                                {allNews ? 'Show less' : `${rest.length} more`}
                            </Button>
                        )}
                    </div>
                    {allNews &&
                        rest.map(n => (
                            <div key={n.title} className="pl-[11px]">
                                <span className="block text-sm text-[#080808]">{n.title}</span>
                                <span className="block text-xs text-[#616161]">{n.text}</span>
                            </div>
                        ))}
                </div>
            )}
        </section>
    );
};

export default OvNotifications;
