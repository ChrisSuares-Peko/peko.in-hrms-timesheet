// PROTOTYPE-SETUP (Developer notes): the "Developer notes" button (in the bottom-right demo controls) and the notes
// panel docked on the right. It always shows the notes for the page the developer is on (useDevPage keys, see
// devPage.tsx) and follows them as they move between pages and sub-tabs. No overlay: the page stays usable.
//   page view ... "Developer notes · {module} module", the title, "How to use these notes", "What this page is", each
//                 section as a heading + bullets, then "Build it with Claude" (Copy prompt + the prompt)
//   guide view .. intro, Reading the prototype, Build order, Shared rules, "Kickoff prompt for Claude Code" (Copy)
// Notes: docs/dev-notes/dev-notes.json. Prototype build only (VITE_PROTOTYPE, see README); never in production.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { CheckOutlined, CloseOutlined, ReadOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { createPortal } from 'react-dom';

import { useCurrentDevPage } from './devPage';
import { DEV_NOTES, type NotesSection, notesFor } from './notes';

const copyText = async (text: string) => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Fallback for browsers without clipboard access (http, older Safari).
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        return ok;
    }
};

const Bullets = ({ items }: { items: string[] }) => (
    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-[18px]">
        {items.map(x => (
            <li key={x} className="text-[13px] leading-[1.45] text-[#344054]">
                {x}
            </li>
        ))}
    </ul>
);

const Section = ({ title, children }: { title?: string; children: ReactNode }) => (
    <section className="mb-4">
        {title && <h4 className="m-0 mb-1.5 text-[13px] font-medium text-[#101828]">{title}</h4>}
        {children}
    </section>
);

/** A prompt with its Copy button. Feedback stays on the button ("Copied"), so no toast covers the panel on phones. */
const PromptBox = ({ title, note, button, text, data }: { title: string; note: string; button: string; text: string; data: string }) => {
    const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
    useEffect(() => {
        if (!copied) return undefined;
        const t = window.setTimeout(() => setCopied(null), 2000);
        return () => window.clearTimeout(t);
    }, [copied]);
    useEffect(() => setCopied(null), [text]);
    let label = button;
    if (copied === 'ok') label = 'Copied';
    if (copied === 'failed') label = 'Couldn’t copy: select the text';
    return (
    <section className="mt-1.5 rounded-[10px] border border-solid border-[#EAECF0] bg-[#F9FAFB] p-3" data-dev-notes-prompt={data}>
        <div className="mb-1 flex items-center gap-2">
            <h4 className="m-0 flex-1 text-[13px] font-medium text-[#101828]">{title}</h4>
            <Button
                size="small"
                type="primary"
                icon={copied === 'ok' ? <CheckOutlined /> : undefined}
                onClick={async () => setCopied((await copyText(text)) ? 'ok' : 'failed')}
                aria-live="polite"
                data-dev-notes-copy={data}
            >
                {label}
            </Button>
        </div>
        <div className="mb-1.5 text-xs text-[#667085]">{note}</div>
        <pre className="m-0 max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-solid border-[#EAECF0] bg-white p-2.5 font-mono text-xs leading-[1.45] text-[#101828]">
            {text}
        </pre>
    </section>
    );
};

const SharedRules = ({ shared }: { shared: NotesSection[] }) => (
    <Section title="Shared rules (apply to every module)">
        {shared.map(([h, items]) => (
            <div key={h} className="mb-2.5">
                <div className="mb-1 text-xs font-medium text-[#101828]">{h}</div>
                <Bullets items={items} />
            </div>
        ))}
    </Section>
);

const DevNotesPanel = () => {
    const pageKey = useCurrentDevPage();
    const [open, setOpen] = useState(false);
    const [guide, setGuide] = useState(false);
    const found = notesFor(pageKey);
    const n = found?.notes ?? null;
    const { guide: G } = DEV_NOTES;

    let label = 'Developer notes · this page';
    if (guide) label = 'Developer notes';
    else if (n) label = `Developer notes · ${n.module} module`;
    let title = n ? n.title : 'No notes for this page yet';
    if (guide) title = 'How to use these notes';

    const panel = (
        <aside
            aria-label="Developer notes"
            className="fixed bottom-0 right-0 top-0 z-[999] flex w-full flex-col border-0 border-l border-solid border-[#EAECF0] bg-white shadow-[-8px_0_30px_rgba(0,0,0,0.10)] sm:w-[460px]"
            data-dev-notes
            data-dev-notes-key={pageKey ?? ''}
            data-dev-notes-shown={found?.key ?? ''}
        >
            <div className="flex items-start justify-between gap-2.5 px-[18px] pb-2.5 pt-4">
                <div className="min-w-0">
                    <div className="text-xs text-[#667085]" data-dev-notes-label>
                        {label}
                    </div>
                    <h2 className="m-0 mt-0.5 text-[17px] font-medium text-[#101828]" data-dev-notes-title>
                        {title}
                    </h2>
                </div>
                <Button size="small" type="text" aria-label="Close" icon={<CloseOutlined />} onClick={() => setOpen(false)} />
            </div>
            <div className="flex items-center gap-2 border-0 border-b border-solid border-[#EAECF0] px-[18px] py-2.5">
                <Button size="small" type={guide ? 'primary' : 'default'} onClick={() => setGuide(g => !g)} data-dev-notes-guide>
                    {guide ? '‹ Back to this page’s notes' : 'How to use these notes'}
                </Button>
            </div>
            <div
                // A new page (or the guide) starts at the top.
                key={guide ? 'guide' : found?.key ?? 'empty'}
                className="flex-1 overflow-y-auto px-[18px] pb-[90px] pt-3"
                data-dev-notes-body={guide ? 'guide' : found?.key ?? 'empty'}
            >
                {guide && (
                    <>
                        <Section>
                            <Bullets items={G.intro} />
                        </Section>
                        <Section title="Reading the prototype">
                            <Bullets items={G.read} />
                        </Section>
                        <Section title="Build order">
                            <Bullets items={G.order} />
                        </Section>
                        <SharedRules shared={G.shared} />
                        <PromptBox
                            title="Kickoff prompt for Claude Code"
                            note="Use this once, at the start of a module, before the page prompts."
                            button="Copy"
                            text={G.kickoff}
                            data="kickoff"
                        />
                    </>
                )}
                {!guide && n && (
                    <>
                        <Section title="What this page is">
                            <p className="m-0 text-[13px] leading-normal text-[#344054]">{n.what}</p>
                        </Section>
                        {n.sections.map(([h, items]) => (
                            <Section key={h} title={h}>
                                <Bullets items={items} />
                            </Section>
                        ))}
                        <PromptBox
                            title="Build it with Claude"
                            note="Paste into Claude Code in the real code base."
                            button="Copy prompt"
                            text={n.prompt}
                            data="page"
                        />
                    </>
                )}
                {!guide && !n && (
                    <div className="text-xs text-[#667085]" data-dev-notes-empty>
                        Open “How to use these notes” for the general rules.
                    </div>
                )}
            </div>
        </aside>
    );

    return (
        <>
            <Button size="small" type={open ? 'primary' : 'text'} icon={<ReadOutlined />} onClick={() => setOpen(o => !o)} aria-expanded={open} data-dev-notes-button>
                {open ? 'Close notes' : 'Developer notes'}
            </Button>
            {open && createPortal(panel, document.body)}
        </>
    );
};

export default DevNotesPanel;
