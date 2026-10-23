// PROTOTYPE-SETUP (My team, Slice 5): the ESS sidebar — the same pages for everyone; "My team" only with direct reports.
import { describe, expect, it } from 'vitest';

import { paths } from '@src/routes/paths';

import { ESS_EMPLOYEE_GROUP, ESS_MANAGER_GROUP, essSubItems, navOpenKeys } from '../essNav';

describe('ESS sidebar', () => {
    it('the same pages for the manager persona; My team (with its badge) only when there are direct reports', () => {
        const employee = essSubItems('both', paths.essEmployee.index);
        const manager = essSubItems('both', paths.essManager.index, { waiting: 4 });
        expect(employee.map(i => i.text)).toEqual(manager.slice(0, -1).map(i => i.text));
        expect(employee.some(i => i.text === 'My team')).toBe(false);
        expect(manager.at(-1)).toEqual({ key: `${paths.essManager.index}/my-team`, text: 'My team', badge: 4 });
    });
    it('each ESS group opens while one of its pages is open', () => {
        expect(navOpenKeys(`${paths.essManager.index}/my-team/approvals`)).toEqual([ESS_MANAGER_GROUP]);
        expect(navOpenKeys(`${paths.essEmployee.index}/leaves`)).toEqual([ESS_EMPLOYEE_GROUP]);
        expect(navOpenKeys('/payroll')).toEqual([]);
    });
});
