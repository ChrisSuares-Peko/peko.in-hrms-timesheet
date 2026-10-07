// PROTOTYPE-SETUP: endpoints the app shell (header, notifications bell, search) calls on every page.
import type { notification, notificationListResponse } from '@customtypes/general';

import { isoDateTime, monthsAgo } from '../data/dates';
import { EMPLOYEES } from '../data/employees';
import { ModeData, byMode } from '../envelope';
import { MockRoute, route } from '../router';

const notificationItem = (
    id: number,
    title: string,
    brief: string,
    date: string
): notification => ({
    id,
    notificationTitle: title,
    notificationBrief: brief,
    notificationCategory: 'Payroll',
    notificationTo: 'ALL',
    notificationBy: 'Peko',
    scheduleDate: null,
    flag: false,
    createdAt: isoDateTime(date),
    updatedAt: isoDateTime(date),
});

const notifications: ModeData<notificationListResponse> = {
    dummy: {
        data: [
            notificationItem(1, 'Payroll processed', `Salaries for last month were credited to ${EMPLOYEES.length} employees.`, monthsAgo(0, 1)),
            notificationItem(2, 'Leave requests pending', '3 leave requests are awaiting approval.', monthsAgo(0, 2)),
        ],
        count: 2,
    },
    empty: { data: [], count: 0 },
};

export const shellRoutes: MockRoute[] = [
    route('GET', ':type/:uid/others/notification', ({ mode }) => byMode(mode, notifications)),
    route('PUT', ':type/:uid/others/notification', ({ mode }) => ({ ...byMode(mode, notifications), count: 0 })),
    route('GET', ':type/:uid/others/dashboard/recent-history', () => []),
    route('GET', ':type/:uid/others/dashboard/search', () => []),
    route('GET', ':type/:uid/others/dashboard/store-history', () => []),
    // Single identity in the prototype — nothing to switch to.
    route('GET', 'user/available-roles', () => ({ roles: [] })),
];
