// PROTOTYPE-SETUP: ESS Service 1 — links inside the current ESS tab (ESS - Employee or ESS - Manager).
//   section(tab?, date?)  Attendance & Timesheet section, e.g. /ess-employee/attendance-timesheet/overtime;
//                   with a date (PROTOTYPE-SETUP: Overview, Slice 2) the tab opens on that day (?date=YYYY-MM-DD)
//   myTeam(tab?)    "My team", e.g. /ess-manager/my-team/approvals
//   member(id)      read-only view of a direct report's timesheet
import { useContext } from 'react';

import { UNSAFE_LocationContext as LocationContext } from 'react-router-dom';

import { ESS_TABS, essTabFor } from '@src/prototype/persona/essPersonas';

import type { AtsTab } from '../types';

// PROTOTYPE-SETUP (My team, Slice 3): one Approvals inbox replaces the per-type approval tabs.
export type MyTeamTab = 'approvals' | 'today' | 'attendance' | 'timesheets' | 'leave-calendar';

export const atsPathsFor = (base: string) => ({
    home: base,
    section: (tab?: AtsTab, date?: string) =>
        `${base}/attendance-timesheet${tab ? `/${tab}` : ''}${date ? `?date=${date}` : ''}`,
    myTeam: (tab?: MyTeamTab) => `${base}/my-team${tab ? `/${tab}` : ''}`,
    member: (employeeId: number, query?: { date?: string; review?: boolean }) => {
        const params = new URLSearchParams();
        if (query?.date) params.set('date', query.date);
        if (query?.review) params.set('review', '1');
        const qs = params.toString();
        return `${base}/my-team/members/${employeeId}${qs ? `?${qs}` : ''}`;
    },
});

export const useAtsPaths = () => {
    const pathname = useContext(LocationContext)?.location?.pathname ?? '';
    return atsPathsFor((essTabFor(pathname) ?? ESS_TABS[0]).base);
};

export default useAtsPaths;
