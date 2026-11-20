// PROTOTYPE-SETUP (Developer notes): splitting the notes, the module for each page, and the markdown renderer.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NOTES_RAW from '../../../../docs/dev-notes/developer-notes.md?raw';
import { moduleForPath, parseNotes, renderMarkdown } from '../devNotes';

describe('parseNotes', () => {
    it('splits the real notes on the module markers, titles from the first heading', () => {
        const { intro, modules } = parseNotes(NOTES_RAW);
        expect(intro).toContain('# Developer notes');
        expect(modules.map(m => m.id)).toEqual(['shared', 'attendance', 'timesheet', 'overtime', 'leave', 'reimbursements', 'profile-and-employees', 'my-team', 'ess-shell', 'payroll-settings']);
        expect(modules.find(m => m.id === 'leave')?.title).toBe('Leave module');
        expect(modules.find(m => m.id === 'shared')?.title).toBe('Shared platform (every module)');
        expect(modules.every(m => !m.markdown.includes('<!-- module:'))).toBe(true);
    });
    it('handles CRLF and text before the first marker', () => {
        const { intro, modules } = parseNotes('Intro\r\n<!-- module: a -->\r\n## A\r\n- x\r\n<!-- module: b -->\r\nno heading');
        expect(intro).toBe('Intro');
        expect(modules).toEqual([
            { id: 'a', title: 'A', markdown: '## A\n- x' },
            { id: 'b', title: 'b', markdown: 'no heading' },
        ]);
    });
});

describe('moduleForPath', () => {
    it.each([
        ['/ess-employee', 'ess-shell'],
        ['/ess-employee/attendance-timesheet', 'attendance'],
        ['/ess-employee/attendance-timesheet/timesheet', 'attendance'],
        ['/ess-employee/leaves', 'leave'],
        ['/ess-manager/leaves', 'leave'],
        ['/ess-employee/reimbursements', 'reimbursements'],
        ['/ess-employee/profile', 'profile-and-employees'],
        ['/ess-manager/my-team', 'my-team'],
        ['/ess-manager/my-team/approvals', 'my-team'],
        ['/ess-employee/payslips', 'ess-shell'],
        ['/payroll', 'shared'],
        ['/payroll/services/timesheet', 'timesheet'],
        ['/payroll/timesheet', 'attendance'],
        ['/payroll/services/leave', 'leave'],
        ['/payroll/services/overtime', 'overtime'],
        ['/payroll/services/reimbursements', 'reimbursements'],
        ['/payroll/employees', 'profile-and-employees'],
        ['/payroll/employees/add-employee', 'profile-and-employees'],
        ['/payroll/HR-settings', 'payroll-settings'],
        ['/payroll/salary-dashboard', 'shared'],
        ['/', 'shared'],
    ])('%s → %s', (path, module) => {
        expect(moduleForPath(path)).toBe(module);
    });
});

describe('renderMarkdown', () => {
    it('renders headings, bullets, bold and inline code', () => {
        const { container } = render(<div>{renderMarkdown('## Leave module\n\n### ESS · Layout\n- **Available** = credited − `approved`\n- second\n  continued\n\nA paragraph.')}</div>);
        expect(container.querySelector('h3')?.textContent).toBe('Leave module');
        expect(container.querySelector('h4')?.textContent).toBe('ESS · Layout');
        const items = container.querySelectorAll('li');
        expect(items).toHaveLength(2);
        expect(items[0].querySelector('strong')?.textContent).toBe('Available');
        expect(items[0].querySelector('code')?.textContent).toBe('approved');
        expect(items[1].textContent).toBe('second continued');
        expect(container.querySelector('p')?.textContent).toBe('A paragraph.');
    });
    it('renders every module of the real notes without raw markdown left over', () => {
        parseNotes(NOTES_RAW).modules.forEach(m => {
            const { container, unmount } = render(<div>{renderMarkdown(m.markdown)}</div>);
            expect(container.textContent).not.toMatch(/\*\*|^#+\s|<!--/m);
            expect(container.querySelectorAll('li').length).toBeGreaterThan(0);
            unmount();
        });
    });
});
