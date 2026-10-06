import React, { useState } from 'react';

import { Badge, Button, Col, Flex, Select, Skeleton, Typography } from 'antd';

import { formatNumberWithLocalStringWithoutDecimalPoint, roundMoney } from '@utils/priceFormat';

import TDSDetailsDrawer from './TDSDetailsDrawer';
import { SalaryProfileTabProps } from '../../types/salaryProfileTypes/employeeSalaryTable';
import { monthNames, monthsArray, yearsArray } from '../../utils/salaryTable/data';

const { Title, Text } = Typography;

const TEXT_DARK = '#181D27';
const TEXT_MUTED = '#535862';
const VALUE_MUTED = '#94A3B8';
const BORDER = '#E2E8F0';
const SECTION_BG = '#F8FAFC';

const fmt = (amount: number) => `₹ ${formatNumberWithLocalStringWithoutDecimalPoint(roundMoney(amount))}`;
const fmtMonthly = (amount: number) => `${fmt(amount)} / month`;
// A genuinely one-time amount (arrears, paid & taxed in this specific month) shouldn't
// read as "/ month" — that implies it recurs. Derived from the badge text so the backend
// only needs to own the badge copy, not a separately-formatted currency string.
const fmtOneTime = (amount: number) => `${fmt(amount)} · this month`;
// Display-only relabel — the backend's stored/returned component name stays "Provident
// Fund (PF)" (it's the exact-match identifier the calculation engine relies on), only what
// the employee sees changes, to avoid confusion with the separate employer PF row.
const displayComponentName = (componentName: string) =>
    componentName === 'Provident Fund (PF)' ? "PF Employee's Contribution" : componentName;

const MONTH_NAMES_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const STATUS_STYLES: Record<string, { bg: string; color: string; badgeStatus: 'success' | 'warning' | 'error' | 'default' }> = {
    approved: { bg: '#ECFDF3', color: '#12B76A', badgeStatus: 'success' },
    paid: { bg: '#ECFDF3', color: '#12B76A', badgeStatus: 'success' },
    completed: { bg: '#ECFDF3', color: '#12B76A', badgeStatus: 'success' },
    pending: { bg: '#FFF6EA', color: '#D48806', badgeStatus: 'warning' },
    upcoming: { bg: '#FFF6EA', color: '#D48806', badgeStatus: 'warning' },
    failed: { bg: '#FFF1F0', color: '#FF4D4F', badgeStatus: 'error' },
};

const statusLabel = (status: string) => (status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : '');

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
    <Flex vertical style={{ flex: 1, minWidth: 160 }}>
        <Text className="text-xs" style={{ color: TEXT_MUTED }}>
            {label}
        </Text>
        <Text className="font-semibold" style={{ fontSize: 16 }}>
            {value}
        </Text>
    </Flex>
);

const RowBadge = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
    <span
        style={{
            background: SECTION_BG,
            border: `1px solid ${BORDER}`,
            color: muted ? VALUE_MUTED : TEXT_MUTED,
            fontSize: 12,
            lineHeight: '16px',
            padding: '2px 8px',
            borderRadius: 6,
        }}
    >
        {children}
    </span>
);

interface RowProps {
    label: string;
    badge?: string;
    value: number;
    valueLabel?: string;
    muted?: boolean;
    footnote?: React.ReactNode;
}

const Row = ({ label, badge, value, valueLabel, muted, footnote }: RowProps) => (
    <div className="py-3 px-4">
        <Flex vertical gap={4}>
            <Flex justify="space-between" align="center" gap={10}>
                <Flex wrap align="center" gap={10} className="min-w-0">
                    <Text className="text-sm" style={{ color: muted ? VALUE_MUTED : TEXT_DARK }}>
                        {label}
                    </Text>
                    {badge && <RowBadge muted={muted}>{badge}</RowBadge>}
                </Flex>
                <Text className="text-sm" style={{ color: muted ? VALUE_MUTED : TEXT_DARK, whiteSpace: 'nowrap' }}>
                    {valueLabel ?? fmtMonthly(value)}
                </Text>
            </Flex>
            {footnote && (
                <Text className="text-xs mt-1" style={{ color: VALUE_MUTED }}>
                    {footnote}
                </Text>
            )}
        </Flex>
    </div>
);

const FooterBar = ({ label, value }: { label: string; value: number }) => (
    <Flex
        justify="space-between"
        align="center"
        className="py-3 px-4"
        style={{ background: SECTION_BG, borderTop: `1px solid ${BORDER}` }}
    >
        <Text className="text-sm font-semibold" style={{ color: TEXT_DARK }}>
            {label}
        </Text>
        <Text className="text-sm font-semibold" style={{ color: TEXT_DARK }}>
            {fmtMonthly(value)}
        </Text>
    </Flex>
);

const SectionHeader = ({ title }: { title: string }) => (
    <Flex
        justify="space-between"
        align="center"
        className="px-4"
        style={{ background: SECTION_BG, borderBottom: `1px solid ${BORDER}`, paddingTop: 8, paddingBottom: 8, minHeight: 44 }}
    >
        <Text className="font-medium text-sm" style={{ color: TEXT_DARK }}>
            {title}
        </Text>
    </Flex>
);

const Section = ({
    title,
    footer,
    children,
}: {
    title: string;
    footer?: { label: string; value: number };
    children: React.ReactNode;
}) => (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <SectionHeader title={title} />
        <div className="divide-y divide-[#F1F5F9]">{children}</div>
        {footer && <FooterBar label={footer.label} value={footer.value} />}
    </div>
);

export default function SalaryProfileTab({
    salaryRows,
    totals,
    tableLoading,
    month,
    year,
    status = 'UPCOMING',
    monthlyGrossSalary,
    monthlyCTC,
    annualCTC,
    earnings = [],
    deductions = [],
    employerContributions = [],
    lwf,
    netSalary,
    tdsDetails,
    notRecorded,
    onMonthChange,
    onYearChange,
}: SalaryProfileTabProps) {
    const monthTitle = month ? monthNames[month - 1] || '' : '';
    const statusKey = status.toLowerCase();
    const statusStyle = STATUS_STYLES[statusKey] || STATUS_STYLES.pending;
    const isRecorded = ['paid', 'approved', 'completed'].includes(statusKey);
    const [tdsDrawerOpen, setTdsDrawerOpen] = useState(false);

    if (tableLoading) {
        return (
            <Col>
                <Skeleton active paragraph={{ rows: 8 }} />
            </Col>
        );
    }

    if (notRecorded || !salaryRows.length) {
        return (
            <Col>
                <Flex align="center" justify="space-between" wrap="wrap" gap={12}>
                    <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
                        {monthTitle} {year} Salary Info
                    </Title>
                    <Flex gap={8}>
                        <Select
                            style={{ width: 130 }}
                            value={String(month)}
                            options={monthsArray}
                            onChange={value => onMonthChange?.(Number(value))}
                        />
                        <Select
                            style={{ width: 100 }}
                            value={String(year)}
                            options={yearsArray}
                            onChange={value => onYearChange?.(Number(value))}
                        />
                    </Flex>
                </Flex>
                <Text className="text-sm block mt-4" style={{ color: TEXT_MUTED }}>
                    No payroll has been generated for {monthTitle} {year} yet.
                </Text>
            </Col>
        );
    }

    return (
        <Col style={{ maxWidth: 900 }}>
            <Flex align="center" justify="space-between" wrap="wrap" gap={12}>
                <Flex align="center" gap={12}>
                    <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
                        {monthTitle} {year} Salary Info
                    </Title>
                    <Badge
                        status={statusStyle.badgeStatus}
                        text={statusLabel(status)}
                        style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, padding: '4px 10px', borderRadius: 10 }}
                    />
                </Flex>
                <Flex gap={8}>
                    <Select
                        style={{ width: 130 }}
                        value={String(month)}
                        options={monthsArray}
                        onChange={value => onMonthChange?.(Number(value))}
                    />
                    <Select
                        style={{ width: 100 }}
                        value={String(year)}
                        options={yearsArray}
                        onChange={value => onYearChange?.(Number(value))}
                    />
                </Flex>
            </Flex>
            <Text className="text-xs block mt-1" style={{ color: TEXT_MUTED }}>
                {isRecorded
                    ? `Payroll for ${monthTitle} ${year} has been recorded.`
                    : `Payroll for ${monthTitle} ${year} hasn't been recorded yet — amounts show what will be paid.`}
            </Text>

            {(monthlyGrossSalary != null || monthlyCTC != null || annualCTC != null) && (
                <Flex
                    className="mt-6 px-4 py-3"
                    wrap="wrap"
                    gap={16}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 12 }}
                >
                    {monthlyGrossSalary != null && <SummaryCard label="Monthly Gross Salary" value={fmt(monthlyGrossSalary)} />}
                    {monthlyCTC != null && <SummaryCard label="Monthly CTC" value={fmt(monthlyCTC)} />}
                    {annualCTC != null && <SummaryCard label="Annual CTC" value={fmt(annualCTC)} />}
                </Flex>
            )}

            {earnings.length > 0 && (
                <div className="mt-6">
                    <Section title="Earnings" footer={{ label: 'Gross Salary (Total Earnings)', value: totals.totalEarnings }}>
                        {earnings.map(earning => (
                            <Row
                                key={earning.componentName}
                                label={earning.componentName}
                                badge={earning.badge}
                                value={earning.amount}
                                valueLabel={earning.componentName === 'Arrears' ? fmtOneTime(earning.amount) : undefined}
                            />
                        ))}
                    </Section>
                </div>
            )}

            {(deductions.length > 0 || lwf) && (
                <div className="mt-6">
                    <Section title="Deductions" footer={{ label: 'Total Deductions', value: totals.totalDeductions }}>
                        {deductions.map(deduction => (
                            <Row
                                key={deduction.componentName}
                                label={displayComponentName(deduction.componentName)}
                                badge={deduction.badge}
                                value={deduction.amount}
                                footnote={
                                    deduction.componentName === 'Income Tax (TDS)' && tdsDetails ? (
                                        <Button
                                            type="link"
                                            danger
                                            className="px-0 h-auto text-xs"
                                            onClick={() => setTdsDrawerOpen(true)}
                                        >
                                            How is this calculated?
                                        </Button>
                                    ) : undefined
                                }
                            />
                        ))}
                        {lwf && (
                            <Row
                                label="Labour Welfare Fund"
                                badge={
                                    lwf.scheduleLabel
                                        ? `Statutory — ${lwf.scheduleLabel}${lwf.workState ? ` (${lwf.workState})` : ''}`
                                        : 'Statutory'
                                }
                                value={lwf.amount}
                                muted={lwf.fires === false}
                                valueLabel={
                                    lwf.fires === false && lwf.nextFireMonth != null && lwf.nextFireYear != null
                                        ? `${fmt(lwf.amount)} · in ${MONTH_NAMES_SHORT[lwf.nextFireMonth - 1]} ${lwf.nextFireYear}`
                                        : undefined
                                }
                                footnote={
                                    lwf.fires === false
                                        ? "Not part of this month's total — deducts with the scheduled payroll."
                                        : undefined
                                }
                            />
                        )}
                    </Section>
                </div>
            )}

            <Flex
                className="mt-6 px-4 py-4"
                align="center"
                justify="space-between"
                style={{ background: '#FFF6EA', border: '1px solid #FFE3C1', borderRadius: 12 }}
            >
                <Text className="font-semibold" style={{ fontSize: 18, color: TEXT_DARK }}>
                    Net Salary Payable
                </Text>
                <Text className="font-semibold" style={{ fontSize: 20, color: '#D48806' }}>
                    {fmt(netSalary ?? totals.netSalary)}
                </Text>
            </Flex>

            {employerContributions.length > 0 && (
                <Text className="text-xs block mt-3" style={{ color: VALUE_MUTED }}>
                    Employer contributions — {employerContributions.map(c => `${c.label.replace("'s Contribution", '')} ${fmt(c.amount)} / month`).join(', ')}{' '}
                    — are part of the CTC and are not deducted from pay.
                </Text>
            )}

            <TDSDetailsDrawer open={tdsDrawerOpen} onClose={() => setTdsDrawerOpen(false)} details={tdsDetails || null} />
        </Col>
    );
}
