// PROTOTYPE-SETUP (Developer notes): the notes in docs/dev-notes/developer-notes.md, split into modules on the
// "<!-- module: name -->" markers, the module for each page, and a minimal markdown renderer (headings, bullets, bold,
// inline code, paragraphs). Prototype-only: the panel is mounted only when VITE_PROTOTYPE is on (see README).
import type { ReactNode } from 'react';

import { serviceOfPath, type PayrollService } from '@src/prototype/persona/payrollServices';

export interface NotesModule {
    /** The marker's name: "shared", "leave", "my-team", … */
    id: string;
    /** The section's first heading: "Leave module". */
    title: string;
    /** The module's markdown, marker left out. */
    markdown: string;
}

const MARKER = /^<!--\s*module:\s*([a-z0-9-]+)\s*-->\s*$/i;

/** Split the notes into modules (text before the first marker is the file's intro). */
export const parseNotes = (raw: string): { intro: string; modules: NotesModule[] } => {
    const lines = raw.replace(/\r\n/g, '\n').split('\n');
    const intro: string[] = [];
    const modules: NotesModule[] = [];
    let current: { id: string; lines: string[] } | null = null;
    const close = () => {
        if (!current) return;
        const markdown = current.lines.join('\n').trim();
        const heading = markdown.split('\n').find(l => /^#{1,6}\s/.test(l));
        modules.push({ id: current.id, title: heading ? heading.replace(/^#{1,6}\s+/, '').trim() : current.id, markdown });
    };
    lines.forEach(line => {
        const m = line.match(MARKER);
        if (m) {
            close();
            current = { id: m[1].toLowerCase(), lines: [] };
        } else if (current) current.lines.push(line);
        else intro.push(line);
    });
    close();
    return { intro: intro.join('\n').trim(), modules };
};

/** Every module as one markdown file again (markers kept), for "Copy all". */
export const allMarkdown = (raw: string) => raw.replace(/\r\n/g, '\n').trim();

// ---- page → module ---------------------------------------------------------------------------------------------

const ESS_PAGE: Record<string, string> = {
    'attendance-timesheet': 'attendance',
    attendance: 'attendance',
    timesheet: 'attendance',
    leaves: 'leave',
    reimbursements: 'reimbursements',
    profile: 'profile-and-employees',
    'my-team': 'my-team',
    approvals: 'my-team',
};

const PAYROLL_SERVICE: Record<PayrollService, string> = {
    timesheet: 'timesheet',
    attendance: 'attendance',
    leave: 'leave',
    overtime: 'overtime',
    reimbursement: 'reimbursements',
    employees: 'profile-and-employees',
    settings: 'payroll-settings',
};

/**
 * The module for a page: ESS Overview → ess-shell, ESS Attendance & Timesheet → attendance, ESS Leave → leave, ESS
 * Reimbursements → reimbursements, ESS Profile → profile-and-employees, My team → my-team; each Payroll service page →
 * its module (the Payroll dashboard → shared, Payroll settings → payroll-settings). Anything else → shared.
 */
export const moduleForPath = (pathname: string): string => {
    const p = pathname.replace(/\/+$/, '') || '/';
    const ess = p.match(/^\/ess-(?:employee|manager)(?:\/([^/?#]+))?/i);
    if (ess) return ess[1] ? ESS_PAGE[ess[1].toLowerCase()] ?? 'ess-shell' : 'ess-shell';
    const service = serviceOfPath(p);
    if (service) return PAYROLL_SERVICE[service];
    if (/^\/payroll\/employees(\/|$)/i.test(p)) return 'profile-and-employees';
    return 'shared';
};

// ---- markdown ------------------------------------------------------------------------------------------------

/** **bold** and `code` inside a line. */
export const renderInline = (text: string, key = 'i'): ReactNode[] => {
    const out: ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    let m: RegExpExecArray | null = re.exec(text);
    let n = 0;
    while (m) {
        if (m.index > last) out.push(text.slice(last, m.index));
        const tok = m[0];
        if (tok.startsWith('**')) out.push(<strong key={`${key}-${n}`}>{tok.slice(2, -2)}</strong>);
        else
            out.push(
                <code key={`${key}-${n}`} className="rounded bg-[#F2F4F7] px-1 py-0.5 text-[0.85em]">
                    {tok.slice(1, -1)}
                </code>
            );
        n += 1;
        last = m.index + tok.length;
        m = re.exec(text);
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
};

const HEADING_CLASS: Record<number, string> = {
    1: 'm-0 mb-2 text-lg font-semibold text-gray-900',
    2: 'm-0 mb-2 text-base font-semibold text-gray-900',
    3: 'm-0 mt-4 mb-1.5 text-sm font-semibold text-gray-900',
    4: 'm-0 mt-3 mb-1 text-sm font-medium text-gray-800',
};

/** Headings (#–####), bullet lists ("- " / "* ", indented ones nested one level), paragraphs, bold and inline code. */
export const renderMarkdown = (md: string): ReactNode[] => {
    const blocks: ReactNode[] = [];
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    let list: { text: string; nested: boolean }[] = [];
    let para: string[] = [];
    const flushList = () => {
        if (!list.length) return;
        const k = `ul-${blocks.length}`;
        blocks.push(
            <ul key={k} className="m-0 mb-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-gray-700">
                {list.map((li, i) => (
                    <li key={`${k}-${i}`} className={li.nested ? 'ml-4 list-[circle]' : ''}>
                        {renderInline(li.text, `${k}-${i}`)}
                    </li>
                ))}
            </ul>
        );
        list = [];
    };
    const flushPara = () => {
        if (!para.length) return;
        const k = `p-${blocks.length}`;
        blocks.push(
            <p key={k} className="m-0 mb-2 text-sm leading-relaxed text-gray-700">
                {renderInline(para.join(' '), k)}
            </p>
        );
        para = [];
    };
    lines.forEach(line => {
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
        if (heading) {
            flushList();
            flushPara();
            const level = Math.min(heading[1].length, 4);
            const k = `h-${blocks.length}`;
            const Tag = `h${level + 1}` as 'h2' | 'h3' | 'h4' | 'h5';
            blocks.push(
                <Tag key={k} className={HEADING_CLASS[level]}>
                    {renderInline(heading[2], k)}
                </Tag>
            );
        } else if (bullet) {
            flushPara();
            list.push({ text: bullet[2], nested: bullet[1].length >= 2 });
        } else if (!line.trim() || MARKER.test(line)) {
            flushList();
            flushPara();
        } else if (list.length && /^\s{2,}\S/.test(line)) {
            list[list.length - 1].text += ` ${line.trim()}`;
        } else {
            flushList();
            para.push(line.trim());
        }
    });
    flushList();
    flushPara();
    return blocks;
};
