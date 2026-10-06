import { Flex } from 'antd';

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

const ServiceShortcuts = () => {
    const employeePaths = useEmployeePaths();
    return (
        <Flex align="flex-start" justify="space-between" gap={20} wrap="wrap" className="w-full px-2">
            {shortcuts.map(item => (
                <ServiceShortcutCard
                    key={item.title}
                    icon={item.icon}
                    title={item.title}
                    path={employeePaths[item.pathKey]}
                />
            ))}
        </Flex>
    );
};

export default ServiceShortcuts;
