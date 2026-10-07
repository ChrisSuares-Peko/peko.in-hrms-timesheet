// PROTOTYPE-SETUP: shared layout for both ESS sidebar tabs ("ESS - Employee", "ESS - Manager"). Mounts the
// existing ESS portal pages from src/domains/employee inside the corporate dashboard layout (so the sidebar
// stays visible); this in-page tab bar replaces the navigation EmployeePortalLayout would provide. Title and
// links come from the current tab (essPersonas.ts), so the same component serves both personas.
// ESS Service 1: "Attendance & Timesheet" (named per mode) replaces Attendance / My Timesheet, and people
// managers get "My team".
import { Suspense, useEffect, useState } from 'react';

import { Flex, Skeleton, Tabs, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { getAtsSettings } from '@src/domains/attendanceTimesheet/api';
import type { AtsMode } from '@src/domains/attendanceTimesheet/types';
import { titleFor } from '@src/prototype/rules/attendance';
import { directReportsOf } from '@src/prototype/mocks/data/employees';
import { ESS_TABS, essTabFor } from '@src/prototype/persona/essPersonas';

const { Title } = Typography;

/** Outlet context the ESS tab layout gives its pages. Absent on the real /employee portal. */
export interface EssOutletContext {
    atsMode?: AtsMode;
    /** The tab's persona has direct reports. */
    isManager: boolean;
}

const PAGES: { key: string; label: string }[] = [
    { key: 'home', label: 'Home' },
    { key: 'attendanceTimesheet', label: 'Attendance & Timesheet' }, // label follows the mode
    { key: 'myTeam', label: 'My team' }, // only for personas with direct reports
    { key: 'leaves', label: 'Leaves' },
    { key: 'payslips', label: 'Payslips' },
    { key: 'reimbursements', label: 'Reimbursements' },
    { key: 'documents', label: 'Documents' },
    { key: 'profile', label: 'Profile' },
];

const EssLayout = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const tab = essTabFor(pathname) ?? ESS_TABS[0];
    const [atsMode, setAtsMode] = useState<AtsMode | undefined>(undefined);

    useEffect(() => {
        getAtsSettings({ userType: 'user', userId: tab.persona.id }).then(s => s && setAtsMode(s.mode));
    }, [tab.persona.id]);

    const isManager = directReportsOf(tab.persona.employeeId).length > 0;
    const items = PAGES.filter(page => page.key !== 'myTeam' || isManager).map(page => ({
        key: tab.paths[page.key],
        label: page.key === 'attendanceTimesheet' && atsMode ? titleFor(atsMode) : page.label,
    }));
    // Longest matching path wins, so /ess-employee/leaves selects "Leaves" rather than "Home".
    const activeKey =
        items
            .filter(item => pathname === item.key || pathname.startsWith(`${item.key}/`))
            .sort((a, b) => b.key.length - a.key.length)[0]?.key ?? tab.paths.home;

    return (
        <Flex vertical gap={8} className="w-full min-w-0">
            <Title level={4} className="!mb-0">
                {tab.label}
            </Title>
            <Tabs
                activeKey={activeKey}
                items={items}
                onChange={key => navigate(key)}
                className="w-full min-w-0"
            />
            <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
                <Outlet context={{ atsMode, isManager } satisfies EssOutletContext} />
            </Suspense>
        </Flex>
    );
};

export default EssLayout;
