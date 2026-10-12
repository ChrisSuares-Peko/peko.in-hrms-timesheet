// PROTOTYPE-SETUP (Overview, Slice 3; decluttered in Overview v2, Slice 3): section 5 — notifications:
//   Needs your action  all of them: sent-back week ("Fix and resubmit"), missed check-out ("Update check-out"),
//                      unclaimed overtime ("Review overtime"); the header counts them ("N to do")
//   Your requests      the latest 3, plus "View all" (the requests' page when they're all one kind, else Leaves)
//   Announcements      one line at the bottom ("Office closed for {holiday} on {date}"), "N more" expands the rest
// No inner scrolling: the card is as tall as its content.
import { useState } from 'react';

import { Button } from 'antd';
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';

import type { EssHomeView, OverviewLink, OverviewRequest } from '../types';

const TONE = {
    back: 'bg-[#FFF4E8] border-[#FFD9A8]',
    info: 'bg-[#EEF3FF] border-[#C9D7FF]',
    amber: 'bg-[#FFF6E0] border-[#FCE3A6]',
} as const;

const DOT = { pending: 'bg-[#2E62E8]', approved: 'bg-green-500', rejected: 'bg-red-500' } as const;

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
    <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
            <h4 className="m-0 text-[11px] font-medium uppercase tracking-wide text-gray-400">{title}</h4>
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

    return (
        <section aria-label="Notifications" className={`flex min-w-0 flex-col gap-4 self-start rounded-2xl border border-solid border-gray-100 bg-white p-4 shadow-sm ${className}`}>
            <div className="flex items-center gap-2">
                <h3 className="m-0 text-base font-semibold text-valueText">Notifications</h3>
                {actions.length > 0 && (
                    <span className="rounded-full bg-[#FF4F4F] px-2 py-0.5 text-[11px] font-semibold text-white">{actions.length} to do</span>
                )}
            </div>
            <Group title="Needs your action">
                {actions.length ? (
                    actions.map(a => (
                        <div key={`${a.kind}-${a.title}`} className={`flex flex-wrap items-center gap-2 rounded-xl border border-solid px-3 py-2.5 ${TONE[a.tone]}`}>
                            <div className="min-w-0 flex-1 basis-40">
                                <b className="block text-sm font-semibold text-[#101828]">{a.title}</b>
                                <span className="block text-xs text-gray-500">{a.text}</span>
                            </div>
                            <Button size="small" onClick={() => navigate(hrefOf(a.link))}>
                                {a.button}
                            </Button>
                        </div>
                    ))
                ) : (
                    <span className="text-sm text-gray-500">Nothing needs your attention.</span>
                )}
            </Group>
            <Group
                title="Your requests"
                extra={
                    requests.length > 0 && (
                        <Link to={hrefOf(viewAllLink(requests))} className="text-xs font-medium text-[#2E62E8] hover:underline">
                            View all
                        </Link>
                    )
                }
            >
                {requests.length ? (
                    <ul className="m-0 flex list-none flex-col p-0">
                        {requests.slice(0, SHOWN_REQUESTS).map(r => (
                            <li key={`${r.type}-${r.id}`}>
                                <button
                                    type="button"
                                    onClick={() => navigate(hrefOf(r.link))}
                                    className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg border-0 bg-transparent px-1.5 py-1.5 text-left hover:bg-gray-50"
                                >
                                    <span aria-hidden className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${DOT[r.state]}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm text-[#101828]">
                                            {r.title} <span className="text-gray-500">{r.detail}</span>
                                        </span>
                                        <span className="block text-xs text-gray-500">{r.statusText}</span>
                                    </span>
                                    <span className="shrink-0 text-xs text-gray-400">{dayjs(r.at).format('D MMM')}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <span className="text-sm text-gray-500">No requests yet.</span>
                )}
            </Group>
            {first && (
                <div aria-label="Announcements" className="flex flex-col gap-1.5 border-0 border-t border-solid border-gray-100 pt-3">
                    <div className="flex items-baseline gap-2 text-sm">
                        <span aria-hidden className="inline-block h-3 w-[3px] shrink-0 self-center rounded bg-[#FF4F4F]" />
                        <span className="min-w-0 flex-1 text-[#101828]">{firstLine}</span>
                        {rest.length > 0 && (
                            <Button type="link" size="small" className="!h-auto !p-0 !text-xs" onClick={() => setAllNews(v => !v)} aria-expanded={allNews}>
                                {allNews ? 'Show less' : `${rest.length} more`}
                            </Button>
                        )}
                    </div>
                    {allNews &&
                        rest.map(n => (
                            <div key={n.title} className="pl-[11px]">
                                <span className="block text-sm text-[#101828]">{n.title}</span>
                                <span className="block text-xs text-gray-500">{n.text}</span>
                            </div>
                        ))}
                </div>
            )}
        </section>
    );
};

export default OvNotifications;
