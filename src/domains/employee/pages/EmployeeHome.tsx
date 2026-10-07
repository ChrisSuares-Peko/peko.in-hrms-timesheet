import { Flex, Spin } from 'antd';
import { Navigate } from 'react-router-dom';

import { useEmployeePaths } from '@src/domains/employee/hooks/useEmployeePaths';

import Dashboard from './Dashboard';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';

// Entry point for the ESS portal: onboarding gate, then the employee dashboard.
const EmployeeHome = () => {
    const employeePaths = useEmployeePaths(); // PROTOTYPE-SETUP: stay inside the current ESS tab
    const { loading, isComplete } = useOnboardingStatus();

    if (loading) {
        return (
            <Flex align="center" justify="center" className="py-24">
                <Spin size="large" />
            </Flex>
        );
    }

    if (!isComplete) {
        return <Navigate to={employeePaths.onboarding} replace />;
    }

    return <Dashboard />;
};

export default EmployeeHome;
