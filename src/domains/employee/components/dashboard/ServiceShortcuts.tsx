import { Flex } from 'antd';
import { useLocation, useOutletContext } from 'react-router-dom';

import type { EssOutletContext } from '@src/domains/dashboard/Ess/pages/EssLayout';
import { essTabFor } from '@src/prototype/persona/essPersonas';
import { titleFor } from '@src/prototype/rules/attendance';

import ServiceShortcutCard from './ServiceShortcutCard';
import AttendanceIcon from '../../assets/icons/attendance.svg';
import DocumentsIcon from '../../assets/icons/documents.svg';
import LeavesIcon from '../../assets/icons/leave.svg';
import MyPayIcon from '../../assets/icons/myPay.svg';
import ProfileIcon from '../../assets/icons/myProfile.svg';
import ReimbursementIcon from '../../assets/icons/reimbursement.svg';
import { useEmployeePaths } from '../../hooks/useEmployeePaths';

// In-dashboard service shortcuts — no "Dashboard" card since this row lives on the dashboard itself.
// PROTOTYPE-SETUP: path keys resolved per render via useEmployeePaths (was paths.employee.* constants).
const shortcuts: { title: string; icon: string; pathKey: string }[] = [
    { title: 'Attendance', icon: AttendanceIcon, pathKey: 'attendance' },
    { title: 'My Pay', icon: MyPayIcon, pathKey: 'payslips' },
    { title: 'Leave', icon: LeavesIcon, pathKey: 'leaves' },
    { title: 'Reimbursement', icon: ReimbursementIcon, pathKey: 'reimbursements' },
    { title: 'Documents', icon: DocumentsIcon, pathKey: 'documents' },
    { title: 'My Profile', icon: ProfileIcon, pathKey: 'profile' },
];

// PROTOTYPE-SETUP: ESS Service 1 — on the ESS tabs the Attendance card opens the Attendance & Timesheet section
// (named per mode); with the in-page tab row gone, these cards are how every ESS page is reached.
const ServiceShortcuts = () => {
    const employeePaths = useEmployeePaths();
    const essContext = useOutletContext<EssOutletContext | undefined>();
    const essTab = essTabFor(useLocation().pathname);
    const items = shortcuts.map(item => {
        if (essContext && essTab && item.pathKey === 'attendance') {
            return { ...item, title: titleFor(essContext.atsMode ?? 'both'), path: essTab.paths.attendanceTimesheet };
        }
        return { ...item, path: employeePaths[item.pathKey] };
    });
    return (
        <Flex align="flex-start" justify="space-between" gap={20} wrap="wrap" className="w-full px-2">
            {items.map(item => (
                <ServiceShortcutCard key={item.pathKey} icon={item.icon} title={item.title} path={item.path} />
            ))}
        </Flex>
    );
};

export default ServiceShortcuts;
