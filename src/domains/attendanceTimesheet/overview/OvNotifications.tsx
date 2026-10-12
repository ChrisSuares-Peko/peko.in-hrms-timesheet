// PROTOTYPE-SETUP (Overview, Slice 3): section 5 — notifications (prototype "OvNotifications"), in three groups:
//   Needs your action  sent-back week ("Fix and resubmit"), missed check-out ("Update check-out"), unclaimed
//                      overtime ("Review overtime"); the header counts them ("N to do")
//   Your requests      latest status of each request, newest first (max 6); each opens its page
//   Announcements      the next weekday office holiday and two notices
import { Button } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

import type { EssHomeView, OverviewLink } from '../types';

const TONE = {
    back: 'bg-[#FFF4E8] border-[#FFD9A8]',
    info: 'bg-[#EEF3FF] border-[#C9D7FF]',
    amber: 'bg-[#FFF6E0] border-[#FCE3A6]',
} as const;

const DOT = { pending: 'bg-[#2E62E8]', approved: 'bg-green-500', rejected: 'bg-red-500' } as const;

const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="flex flex-col gap-2">
        <h4 className="m-0 text-xs font-semibold uppercase tracking-wide text-titleText">{title}</h4>
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
    const { actions, requests, announcements } = home;
    return (
        <section aria-label="Notifications" className={`flex min-h-0 min-w-0 flex-col gap-3 rounded-2xl border border-solid border-gray-100 bg-white p-4 shadow-sm ${className}`}>
            <div className="flex items-center gap-2">
                <h3 className="m-0 text-base font-semibold text-valueText">Notifications</h3>
                {actions.length > 0 && (
                    <span className="rounded-full bg-[#FF4F4F] px-2 py-0.5 text-[11px] font-semibold text-white">{actions.length} to do</span>
                )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
                <Group title="Needs your action">
                    {actions.length ? (
                        actions.map(a => (
                            <div key={`${a.kind}-${a.title}`} className={`flex flex-wrap items-center gap-2 rounded-xl border border-solid px-3 py-2.5 ${TONE[a.tone]}`}>
                                <div className="min-w-0 flex-1 basis-40">
                                    <b className="block text-sm font-semibold text-valueText">{a.title}</b>
                                    <span className="block text-xs text-[#475467]">{a.text}</span>
                                </div>
                                <Button size="small" onClick={() => navigate(hrefOf(a.link))}>
                                    {a.button}
                                </Button>
                            </div>
                        ))
                    ) : (
                        <span className="text-sm text-titleText">Nothing needs your attention.</span>
                    )}
                </Group>
                <Group title="Your requests">
                    {requests.length ? (
                        <ul className="m-0 flex list-none flex-col p-0">
                            {requests.map(r => (
                                <li key={`${r.type}-${r.id}`}>
                                    <button
                                        type="button"
                                        onClick={() => navigate(hrefOf(r.link))}
                                        className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg border-0 bg-transparent px-1.5 py-2 text-left hover:bg-gray-50"
                                    >
                                        <span aria-hidden className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${DOT[r.state]}`} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm">
                                                <b className="font-semibold text-valueText">{r.title}</b>{' '}
                                                <span className="text-titleText">{r.detail}</span>
                                            </span>
                                            <span className="block text-xs text-[#475467]">{r.statusText}</span>
                                        </span>
                                        <span className="shrink-0 text-xs text-titleText">{dayjs(r.at).format('D MMM')}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <span className="text-sm text-titleText">No requests yet.</span>
                    )}
                </Group>
                <Group title="Announcements">
                    {announcements.map(n => (
                        <div key={n.title} className="border-0 border-l-[3px] border-solid border-[#FF4F4F] py-0.5 pl-3">
                            <b className="block text-sm font-semibold text-valueText">{n.title}</b>
                            <span className="block text-xs text-[#475467]">{n.text}</span>
                        </div>
                    ))}
                </Group>
            </div>
        </section>
    );
};

export default OvNotifications;
