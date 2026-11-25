import React, { useEffect, useState } from 'react';

import { Tabs } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';

import { PekoPageHeader } from '@src/components/peko/PageHeader';
// PROTOTYPE-SETUP (Leave module): Leave Policies is rebuilt as Leave types · Public holidays · Configuration · Approvals.
import LeavePoliciesTab from '@src/domains/attendanceTimesheet/leave/settings/LeavePoliciesTab';
// PROTOTYPE-SETUP (Leave module, update): Payroll settings is opened from the dashboard's Quick actions too.
import { PayrollServiceBar } from '@src/domains/attendanceTimesheet/payroll/admin/adminShared';
// PROTOTYPE-SETUP: ESS Service 1 — the single Attendance & Timesheet settings tab (replaces the V1 one).
import AtsSettingsTab from '@src/domains/attendanceTimesheet/payroll/AtsSettingsTab';
// PROTOTYPE-SETUP (Payroll settings → ESS): what employees see in ESS (Payslips, My pay).
import EssVisibilityTab from '@src/domains/attendanceTimesheet/payroll/EssVisibilityTab';
import { useDevPage } from '@src/prototype/devNotes/devPage';

import ComplianceSettings from './complianceSettings';
import BankDetails from '../components/organizationSettings/BankDetails/BankDetails';
import EssSettings from '../components/organizationSettings/EssSettings';
import PayrollCycleDetails from '../components/organizationSettings/PayrollCycleDetails';
import PayrollSettingsForm from '../components/organizationSettings/PayrollSettingsForm';
import SalaryComp from '../components/organizationSettings/SalaryComponents/SalaryComp';
import SubscriptionSettings from '../components/organizationSettings/SubscriptionSettings';

/** Settings tab → notes key (null: the tab sets its own). */
const SETTINGS_KEY: Record<string, string | null> = { '5': null, '10': 'pay:settings:ato', '12': 'pay:settings:reimb', '13': 'pay:settings:ess' };

const OrganizationSettings = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [activeTabKey, setActiveTabKey] = useState('1');
    // PROTOTYPE-SETUP (Developer notes): Leave Policies sets its own sub-tab key (null here); Attendance, timesheet & overtime and
    // Reimbursements have notes; the other settings tabs have none (empty state).
    useDevPage(SETTINGS_KEY[activeTabKey] === undefined ? 'pay:settings:other' : SETTINGS_KEY[activeTabKey]);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const activeTab = queryParams.get('activeTab');

        if (activeTab === '4') {
            // The old standalone Deductions tab was folded into Salary Components (key '3').
            setActiveTabKey('3');
            navigate('?activeTab=3', { replace: true });
        } else if (activeTab === '11') {
            // PROTOTYPE-SETUP (Leave module): the Settings run's separate "Leave" tab folded into Leave Policies.
            setActiveTabKey('5');
            navigate('?activeTab=5&leaveTab=config', { replace: true });
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
            children: activeTabKey === '5' ? <LeavePoliciesTab /> : null,
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
            key: '12',
            label: 'Reimbursements',
            children: activeTabKey === '12' ? <AtsSettingsTab section="reimbursements" /> : null,
        },
        // PROTOTYPE-SETUP (Payroll settings → ESS): Payslips and My pay visibility in ESS (both off by default).
        {
            key: '13',
            label: 'ESS',
            children: activeTabKey === '13' ? <EssVisibilityTab /> : null,
        },
    ];

    return (
        <>
            <PayrollServiceBar active="settings" />
            {/* PROTOTYPE-SETUP (Design update): the Peko page header. */}
            <PekoPageHeader title="Payroll Settings" description="Rules for payroll and every service: leave, attendance, timesheet, overtime and reimbursements." />
            <Tabs activeKey={activeTabKey} items={items} onChange={onChange} />
        </>
    );
};

export default OrganizationSettings;
