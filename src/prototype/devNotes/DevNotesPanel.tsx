// PROTOTYPE-SETUP (Developer notes): the "Developer notes" button (in the bottom-right demo controls) and its right-side
// drawer. The notes are docs/dev-notes/developer-notes.md, imported as raw text at build time (no runtime fetch), split
// into modules and rendered with the app's typography. It opens on the module for the current page; a dropdown
// switches modules ("(this page's module)" marked); Copy (this module as markdown) and Copy all; a link at the bottom
// to Shared platform. Mounted only in the prototype build (VITE_PROTOTYPE, see README) — never in production.
import { useMemo, useState } from 'react';

import { CopyOutlined, ReadOutlined } from '@ant-design/icons';
import { Button, Drawer, Select, Tooltip, Typography, message } from 'antd';
import { useLocation } from 'react-router-dom';

import useScreenSize from '@src/hooks/useScreenSize';

import { allMarkdown, moduleForPath, parseNotes, renderMarkdown } from './devNotes';
import NOTES_RAW from '../../../docs/dev-notes/developer-notes.md?raw';

const { Text } = Typography;

const SHARED = 'shared';

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

const DevNotesPanel = () => {
    const { pathname } = useLocation();
    const { xs } = useScreenSize();
    const notes = useMemo(() => parseNotes(NOTES_RAW), []);
    const pageModule = moduleForPath(pathname);
    const [open, setOpen] = useState(false);
    const [picked, setPicked] = useState<string | null>(null);
    const known = (id: string) => notes.modules.some(m => m.id === id);
    const fallback = known(pageModule) ? pageModule : notes.modules[0]?.id ?? SHARED;
    const current = notes.modules.find(m => m.id === (picked && known(picked) ? picked : fallback));
    const body = useMemo(() => (current ? renderMarkdown(current.markdown) : null), [current]);

    const openPanel = () => {
        setPicked(null); // always opens on this page's module
        setOpen(true);
    };
    const copy = async (what: 'module' | 'all') => {
        const ok = await copyText(what === 'all' ? allMarkdown(NOTES_RAW) : `<!-- module: ${current?.id} -->\n${current?.markdown ?? ''}\n`);
        if (ok) message.success(what === 'all' ? 'All developer notes copied' : `${current?.title ?? 'Module'} copied as markdown`);
        else message.error('Couldn’t copy. Select the text and copy it instead.');
    };

    return (
        <>
            <Tooltip title="Developer notes for this page (prototype only)">
                <Button size="small" type="text" icon={<ReadOutlined />} onClick={openPanel} aria-haspopup="dialog" data-dev-notes-button>
                    {xs ? 'Notes' : 'Developer notes'}
                </Button>
            </Tooltip>
            <Drawer
                open={open}
                onClose={() => setOpen(false)}
                placement="right"
                width={xs ? '100%' : 560}
                title="Developer notes"
                destroyOnHidden
                data-dev-notes
                extra={
                    <div className="flex gap-1">
                        <Button size="small" icon={<CopyOutlined />} onClick={() => copy('module')} data-dev-notes-copy>
                            Copy
                        </Button>
                        <Button size="small" onClick={() => copy('all')} data-dev-notes-copy-all>
                            Copy all
                        </Button>
                    </div>
                }
                footer={
                    current?.id !== SHARED && known(SHARED) ? (
                        <Button type="link" className="!px-0" onClick={() => setPicked(SHARED)} data-dev-notes-shared>
                            Shared platform (every module depends on it) ›
                        </Button>
                    ) : (
                        <Text type="secondary" className="text-xs">
                            Every module also depends on these Shared platform notes.
                        </Text>
                    )
                }
            >
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <Text type="secondary" className="text-xs">
                            Module
                        </Text>
                        <Select
                            value={current?.id}
                            onChange={setPicked}
                            aria-label="Module"
                            options={notes.modules.map(m => ({ value: m.id, label: m.id === pageModule ? `${m.title} (this page's module)` : m.title }))}
                            data-dev-notes-module
                        />
                        <Text type="secondary" className="text-xs">
                            Source: docs/dev-notes/developer-notes.md. Prototype only; not part of the product.
                        </Text>
                    </div>
                    <article className="min-w-0 break-words" data-dev-notes-body={current?.id}>
                        {body}
                    </article>
                </div>
            </Drawer>
        </>
    );
};

export default DevNotesPanel;
