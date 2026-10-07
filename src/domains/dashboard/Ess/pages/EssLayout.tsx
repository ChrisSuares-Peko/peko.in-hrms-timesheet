// PROTOTYPE-SETUP: "ESS - Employee" tab of the prototype. Reuses the ESS portal pages from
// src/domains/employee inside the corporate dashboard layout (so the sidebar stays visible); this in-page
// tab bar replaces the navigation EmployeePortalLayout would otherwise provide.
import { Suspense } from 'react';

import { Flex, Skeleton, Tabs, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { paths } from '@src/routes/paths';

const { Title } = Typography;

const TABS: { key: string; label: string }[] = [
    { key: paths.essEmployee.home, label: 'Home' },
    { key: paths.essEmployee.attendance, label: 'Attendance' },
    { key: paths.essEmployee.leaves, label: 'Leaves' },
    { key: paths.essEmployee.payslips, label: 'Payslips' },
    { key: paths.essEmployee.reimbursements, label: 'Reimbursements' },
    { key: paths.essEmployee.documents, label: 'Documents' },
    { key: paths.essEmployee.profile, label: 'Profile' },
];

// Longest matching tab wins, so /ess-employee/leaves selects "Leaves" rather than "Home".
const activeTabFor = (pathname: string) =>
    TABS.filter(tab => pathname === tab.key || pathname.startsWith(`${tab.key}/`)).sort(
        (a, b) => b.key.length - a.key.length
    )[0]?.key ?? paths.essEmployee.home;

const EssEmployeeLayout = () => {
    const { pathname } = useLocation();
    const navigate = useNavigate();

    return (
        <Flex vertical gap={8} className="w-full min-w-0">
            <Title level={4} className="!mb-0">
                ESS - Employee
            </Title>
            <Tabs
                activeKey={activeTabFor(pathname)}
                items={TABS}
                onChange={key => navigate(key)}
                className="w-full min-w-0"
            />
            <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
                <Outlet />
            </Suspense>
        </Flex>
    );
};

export default EssEmployeeLayout;
