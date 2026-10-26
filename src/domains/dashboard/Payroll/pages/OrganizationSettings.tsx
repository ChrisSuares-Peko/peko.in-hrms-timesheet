import React, { useEffect, useState } from 'react';

import { Tabs, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

// PROTOTYPE-SETUP: ESS Service 1 — the single Attendance & Timesheet settings tab (replaces the V1 one).
import AtsSettingsTab from '@src/domains/attendanceTimesheet/payroll/AtsSettingsTab';

import ComplianceSettings from './complianceSettings';
import LeavePolicyTable from '../components/LeaveSettings/LeavePolicyTable';
import BankDetails from '../components/organizationSettings/BankDetails/BankDetails';
import EssSettings from '../components/organizationSettings/EssSettings';
import PayrollCycleDetails from '../components/organizationSettings/PayrollCycleDetails';
import PayrollSettingsForm from '../components/organizationSettings/PayrollSettingsForm';
import SalaryComp from '../components/organizationSettings/SalaryComponents/SalaryComp';
import SubscriptionSettings from '../components/organizationSettings/SubscriptionSettings';

const OrganizationSettings = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTabKey, setActiveTabKey] = useState('1');

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const activeTab = queryParams.get('activeTab');

        if (activeTab === '4') {
            // The old standalone Deductions tab was folded into Salary Components (key '3').
            setActiveTabKey('3');
            navigate('?activeTab=3', { replace: true });
        } else if (activeTab) {
            setActiveTabKey(activeTab);
        }
    }, [location, navigate]);

    const onChange = (key: string) => {
        setActiveTabKey(key);
        navigate(`?activeTab=${key}`);
    };

    const items = [
        {
            key: '1',
            label: 'Company Profile',
            children: <PayrollSettingsForm setActiveTabKey={setActiveTabKey} />,
        },
        {
            key: '2',
            label: 'Payroll Cycle',
            children: <PayrollCycleDetails setActiveTabKey={setActiveTabKey} />,
        },
        {
            key: '3',
            label: 'Salary Components',
            children: <SalaryComp />,
        },
        {
            key: '5',
            label: 'Leave Policies',
            children: <LeavePolicyTable />,
            disabled: false,
        },
        {
            key: '6',
            label: 'Bank Details',
            children: <BankDetails setActiveTabKey={setActiveTabKey} />,
        },
        {
            key: '7',
            label: 'Compliance Settings',
            children: <ComplianceSettings />,
        },
        {
            key: '8',
            label: 'Subscription Settings',
            children: <SubscriptionSettings />,
        },
        {
            key: '9',
            label: 'ESS Settings',
            children: <EssSettings />,
        },
        // PROTOTYPE-SETUP (Settings, Slices 3–5): all ESS settings, in three tabs (only the open one is mounted, so one tab's
        // save never brings back another's old values). Run payroll isn't here: it's in Process Salary.
        {
            key: '10',
            label: 'Attendance, timesheet & overtime',
            children: activeTabKey === '10' ? <AtsSettingsTab section="ato" /> : null,
        },
        {
            key: '11',
            label: 'Leave',
            children: activeTabKey === '11' ? <AtsSettingsTab section="leave" /> : null,
        },
        {
            key: '12',
            label: 'Reimbursements',
            children: activeTabKey === '12' ? <AtsSettingsTab section="reimbursements" /> : null,
        },
    ];

    return (
        <>
            <Typography.Text className="font-normal text-lg sm:text-2xl">
                Payroll Settings
            </Typography.Text>
            <Tabs className="mt-6" activeKey={activeTabKey} items={items} onChange={onChange} />
        </>
    );
};

export default OrganizationSettings;
