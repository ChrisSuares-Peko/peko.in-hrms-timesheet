// PROTOTYPE-SETUP: the one breadcrumb on the ESS tabs (rendered by the layout's CustomBreadcrumb). The first item
// is the tab ("ESS - Employee" / "ESS - Manager") and links to that tab's Home dashboard; the last item is the
// page's proper name ("Attendance & Timesheet" — named per mode —, "My team", "Leaves", ...). Section sub-tabs in
// the URL (attendance-timesheet/overtime, my-team/today) don't get their own crumb.
import { useEffect, useState } from 'react';

import { Typography } from 'antd';
import { Link } from 'react-router-dom';

import { getAtsSettings } from '@src/domains/attendanceTimesheet/api';
import type { AtsMode } from '@src/domains/attendanceTimesheet/types';
import { findEmployee } from '@src/prototype/mocks/data/employees';
import { titleFor } from '@src/prototype/rules/attendance';

import { EssTab, essTabFor } from './essPersonas';

const PAGE_NAMES: Record<string, string> = {
    leaves: 'Leaves',
    payslips: 'Payslips',
    reimbursements: 'Reimbursements',
    documents: 'Documents',
    profile: 'Profile',
    'my-team': 'My team',
};

const linkItem = (key: string, to: string, label: string) => ({
    key,
    title: (
        <Link to={to}>
            <Typography.Text className="font-normal text-sm text-[#667085]">{label}</Typography.Text>
        </Link>
    ),
});

const currentItem = (key: string, label: string) => ({
    key,
    title: <Typography.Text className="font-normal text-sm text-[#FF9B9B]">{label}</Typography.Text>,
});

const pageName = (segment: string, atsMode: AtsMode | undefined) => {
    if (segment === 'attendance-timesheet') return atsMode ? titleFor(atsMode) : 'Attendance & Timesheet';
    return PAGE_NAMES[segment] ?? segment;
};

export const essBreadcrumbItems = (tab: EssTab, pathname: string, atsMode?: AtsMode) => {
    const [page, sub, id] = pathname.slice(tab.base.length).split('/').filter(Boolean);
    if (!page) return [currentItem('ess-home', tab.label)];
    const home = linkItem('ess-home', tab.base, tab.label);
    // My team > <member name>
    if (page === 'my-team' && sub === 'members') {
        const member = findEmployee(id);
        return [home, linkItem('my-team', `${tab.base}/my-team`, 'My team'), currentItem('member', member?.fullName ?? 'Team member')];
    }
    return [home, currentItem(page, pageName(page, atsMode))];
};

/** Breadcrumb items for an ESS tab page, or null anywhere else. Reads the mode once so the section is named right. */
export const useEssBreadcrumb = (pathname: string) => {
    const tab = essTabFor(pathname);
    const [atsMode, setAtsMode] = useState<AtsMode | undefined>(undefined);
    const personaId = tab?.persona.id;

    useEffect(() => {
        if (!personaId) return;
        getAtsSettings({ userType: 'user', userId: personaId }).then(s => s && setAtsMode(s.mode));
    }, [personaId]);

    return tab ? essBreadcrumbItems(tab, pathname, atsMode) : null;
};
