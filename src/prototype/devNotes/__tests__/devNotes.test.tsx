// PROTOTYPE-SETUP (Developer notes): the page key (innermost component wins, cleared on unmount), the lookup with its
// fallback, and the panel's page / guide / empty views.
import { useState } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import DevNotesPanel from '../DevNotesPanel';
import { DevPageProvider, useCurrentDevPage, useDevPage } from '../devPage';
import { DEV_NOTES, notesFor } from '../notes';

const KEYS_IN_CODE = [
    'ess:home',
    'ess:leave:overview',
    'ess:leave:type',
    'ess:leave:requests',
    'ess:leave:holidays',
    'ess:time:attendance',
    'ess:time:timesheet',
    'ess:time:overtime',
    'ess:team:approvals',
    'ess:team:leavecal',
    'ess:team:today',
    'ess:team:attendance',
    'ess:team:timesheets',
    'ess:team:reimbursements',
    'ess:team:member',
    'ess:reimbursement',
    'ess:profile',
    'pay:dashboard',
    'pay:leave:overview',
    'pay:leave:leaves',
    'pay:leave:requests',
    'pay:leave:details',
    'pay:timesheet:overview',
    'pay:attendance:1',
    'pay:overtime:requests',
    'pay:reimbursement:details',
    'pay:employees',
    'pay:settings:leave:types',
    'pay:settings:leave:holidays',
    'pay:settings:leave:config',
    'pay:settings:leave:approvals',
    'pay:settings:ato',
    'pay:settings:reimb',
];

describe('notesFor', () => {
    it('finds a page, or falls back by trimming the last ":" segment', () => {
        expect(notesFor('ess:leave:overview')?.key).toBe('ess:leave:overview');
        expect(notesFor('ess:team:today')?.key).toBe('ess:team');
        expect(notesFor('pay:timesheet:requests')?.key).toBe('pay:timesheet');
        expect(notesFor('pay:settings:other')).toBeNull();
        expect(notesFor(null)).toBeNull();
    });
    it('every key the screens report has notes (directly or through its parent)', () => {
        KEYS_IN_CODE.forEach(k => expect(notesFor(k), k).not.toBeNull());
    });
    it('every page entry has the full shape', () => {
        Object.entries(DEV_NOTES.pages).forEach(([k, p]) => {
            expect(p.title, k).toBeTruthy();
            expect(p.module, k).toBeTruthy();
            expect(p.what, k).toBeTruthy();
            expect(p.prompt, k).toBeTruthy();
            p.sections.forEach(([h, items]) => {
                expect(h).toBeTruthy();
                expect(Array.isArray(items)).toBe(true);
            });
        });
    });
});

const Show = () => <span data-testid="key">{useCurrentDevPage() ?? 'none'}</span>;
const Child = ({ k }: { k: string }) => {
    useDevPage(k);
    return null;
};
const Parent = ({ child }: { child: string | null }) => {
    useDevPage(child ? null : 'ess:leave:overview');
    return child ? <Child k={child} /> : null;
};

describe('useDevPage', () => {
    it('the innermost component sets the key; a parent passing null never overwrites it; unmount clears it', () => {
        let setChild: (v: string | null) => void = () => {};
        let setShown: (v: boolean) => void = () => {};
        const Harness = () => {
            const [child, sc] = useState<string | null>('ess:leave:type');
            const [shown, ss] = useState(true);
            setChild = sc;
            setShown = ss;
            return (
                <DevPageProvider>
                    {shown && <Parent child={child} />}
                    <Show />
                </DevPageProvider>
            );
        };
        render(<Harness />);
        expect(screen.getByTestId('key').textContent).toBe('ess:leave:type');
        act(() => setChild(null));
        expect(screen.getByTestId('key').textContent).toBe('ess:leave:overview');
        act(() => setChild('ess:leave:requests'));
        expect(screen.getByTestId('key').textContent).toBe('ess:leave:requests');
        act(() => setShown(false));
        expect(screen.getByTestId('key').textContent).toBe('none');
    });
});

describe('DevNotesPanel', () => {
    const renderAt = (k: string | null) =>
        render(
            <DevPageProvider>
                {k && <Child k={k} />}
                <DevNotesPanel />
            </DevPageProvider>
        );
    it('opens on the page notes, toggles the guide, and back', () => {
        renderAt('ess:leave:overview');
        fireEvent.click(screen.getByText('Developer notes'));
        expect(screen.getByText('Close notes')).toBeTruthy();
        const page = DEV_NOTES.pages['ess:leave:overview'];
        expect(document.querySelector('[data-dev-notes-title]')?.textContent).toBe(page.title);
        expect(document.querySelector('[data-dev-notes-label]')?.textContent).toBe(`Developer notes · ${page.module} module`);
        expect(screen.getByText('What this page is')).toBeTruthy();
        expect(screen.getByText('Build it with Claude')).toBeTruthy();
        expect(document.querySelector('[data-dev-notes-prompt="page"] pre')?.textContent).toBe(page.prompt);
        fireEvent.click(screen.getByText('How to use these notes'));
        expect(screen.getByText('Reading the prototype')).toBeTruthy();
        expect(screen.getByText('Build order')).toBeTruthy();
        expect(screen.getByText('Shared rules (apply to every module)')).toBeTruthy();
        expect(screen.getByText('Kickoff prompt for Claude Code')).toBeTruthy();
        expect(screen.getByText('Use this once, at the start of a module, before the page prompts.')).toBeTruthy();
        fireEvent.click(screen.getByText('‹ Back to this page’s notes'));
        expect(document.querySelector('[data-dev-notes-title]')?.textContent).toBe(page.title);
    });
    it('a page without notes shows the empty state', () => {
        renderAt('pay:settings:other');
        fireEvent.click(screen.getByText('Developer notes'));
        expect(screen.getByText('No notes for this page yet')).toBeTruthy();
        expect(screen.getByText('How to use these notes')).toBeTruthy();
    });
});
