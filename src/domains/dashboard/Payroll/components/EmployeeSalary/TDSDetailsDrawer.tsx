import React from 'react';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Card, Col, Divider, Popover, Row, Skeleton, Space, Typography } from 'antd';
import dayjs from 'dayjs';

import DrawerModal from '@components/atomic/DrawerModal';
import { formatNumberWithLocalStringWithoutDecimalPoint, roundMoney } from '@utils/priceFormat';

import { SalaryProfileTdsDetails } from '../../types/salaryProfileTypes/employeeSalaryTable';

const { Title, Text } = Typography;

const fmt = (amount: number) => `₹${formatNumberWithLocalStringWithoutDecimalPoint(roundMoney(amount || 0))}`;

// "400000 -> 4L", "969000 -> 9.7L" — matches how the tax engine's own slab labels read
// elsewhere (e.g. "up to ₹12L").
const formatLakh = (amount: number) => {
    if (amount < 100000) return fmt(amount);
    const lakh = Math.round((amount / 100000) * 10) / 10;
    return `₹${lakh % 1 === 0 ? lakh.toFixed(0) : lakh.toFixed(1)}L`;
};

// Old regime has no marginal-relief messaging in this drawer — its rebate is a flat
// ₹12,500 cap, not the "capped at income over the threshold" mechanic new regime has.
const rebateRowLabel = (taxRegime: string, marginalRelief: number) => {
    if (taxRegime === 'Old Tax Regime') return 'Less: Section 87A rebate';
    if (marginalRelief > 0) return 'Less: Section 87A marginal relief';
    return 'Less: Section 87A rebate / marginal relief';
};

const rebateInfoStyle: React.CSSProperties = { padding: 16, borderRadius: 16, width: 300 };

// Explains whichever of the three mutually-exclusive 87A outcomes actually applied this
// month — matches rebateRowLabel's own branching so the icon's explanation always agrees
// with the label/value it sits beside.
const RebateTooltipContent = ({ details }: { details: SalaryProfileTdsDetails }) => {
    if (details.taxRegime === 'Old Tax Regime') {
        return (
            <Text className="text-xs" style={{ color: '#535862' }}>
                Under the Old Tax Regime, Section 87A gives a rebate on tax — capped at ₹12,500 — when taxable
                income is within the regime&apos;s exemption threshold.
            </Text>
        );
    }

    // rebateLimit comes straight from the tax engine (services/salary.js) — the actual
    // FY/regime-specific threshold (₹5L old regime; ₹7L or ₹12L new regime depending on
    // FY), not a frontend guess, so this stays correct for a historical/already-paid month
    // too, not just the current one.
    const { rebateLimit } = details;

    if (details.marginalRelief > 0) {
        // "Tax = lower of slab tax and the excess" is exactly taxBeforeRebate − totalRebate
        // here — the engine's own marginal-relief formula caps tax at (taxableIncome −
        // rebateLimit) whenever that's less than the full slab tax.
        const incomeAboveLimit = details.taxableIncome - rebateLimit;
        return (
            <Space direction="vertical" size={6} className="w-full">
                <Text strong>Section 87A — marginal relief</Text>
                <DetailRow label="Taxable income" value={fmt(details.taxableIncome)} />
                <DetailRow label="Rebate limit (New regime)" value={fmt(rebateLimit)} />
                <DetailRow label="Slab tax before rebate" value={fmt(details.taxBeforeRebate)} />
                <DetailRow label="Income above the limit" value={fmt(incomeAboveLimit)} />
                <DetailRow label="Tax = lower of slab tax and the excess" value={fmt(incomeAboveLimit)} />
                <Divider className="my-1" />
                <DetailRow
                    label={`Rebate (marginal relief) = ${fmt(details.taxBeforeRebate)} − ${fmt(incomeAboveLimit)}`}
                    value={fmt(details.totalRebate)}
                    strong
                />
                <Text className="text-xs" style={{ color: '#535862' }}>
                    No tax is payable when taxable income is up to {fmt(rebateLimit)}. Slightly above{' '}
                    {fmt(rebateLimit)}, the tax cannot be more than the amount by which income exceeds{' '}
                    {fmt(rebateLimit)}.
                </Text>
            </Space>
        );
    }

    if (details.totalRebate > 0) {
        return (
            <Space direction="vertical" size={6} className="w-full">
                <Text strong>Section 87A — why this tax is nil</Text>
                <DetailRow label="Taxable income" value={fmt(details.taxableIncome)} />
                <DetailRow label="Rebate limit (New regime)" value={fmt(rebateLimit)} />
                <DetailRow label="Slab tax before rebate" value={fmt(details.taxBeforeRebate)} />
                <Divider className="my-1" />
                <DetailRow label="Income is within the limit — whole tax rebated" value={fmt(details.totalRebate)} strong />
                <Text className="text-xs" style={{ color: '#535862' }}>
                    No tax is payable when taxable income is up to {fmt(rebateLimit)}. Slightly above{' '}
                    {fmt(rebateLimit)}, the tax cannot be more than the amount by which income exceeds{' '}
                    {fmt(rebateLimit)}.
                </Text>
            </Space>
        );
    }

    // No rebate, no marginal relief — comfortably past the point (~₹12.7L for FY25-26 New
    // regime) where slab tax growth outpaces the linear excess-over-limit, so "lower of
    // slab tax and the excess" always resolves to the (unchanged) slab tax itself here.
    const incomeAboveLimit = details.taxableIncome - rebateLimit;
    const taxAtExcess = Math.min(details.taxBeforeRebate, incomeAboveLimit);
    return (
        <Space direction="vertical" size={6} className="w-full">
            <Text strong>Section 87A — no rebate</Text>
            <DetailRow label="Taxable income" value={fmt(details.taxableIncome)} />
            <DetailRow label="Rebate limit (New regime)" value={fmt(rebateLimit)} />
            <DetailRow label="Slab tax before rebate" value={fmt(details.taxBeforeRebate)} />
            <DetailRow label="Income above the limit" value={fmt(incomeAboveLimit)} />
            <DetailRow label="Tax = lower of slab tax and the excess" value={fmt(taxAtExcess)} />
            <Divider className="my-1" />
            <DetailRow label="Slab tax is already below the excess — no rebate" value={fmt(0)} strong />
            <Text className="text-xs" style={{ color: '#535862' }}>
                No tax is payable when taxable income is up to {fmt(rebateLimit)}. Slightly above{' '}
                {fmt(rebateLimit)}, the tax cannot be more than the amount by which income exceeds{' '}
                {fmt(rebateLimit)}.
            </Text>
        </Space>
    );
};

const RebateInfoIcon = ({ details }: { details: SalaryProfileTdsDetails }) => (
    <Popover
        content={<RebateTooltipContent details={details} />}
        trigger="hover"
        placement="left"
        overlayInnerStyle={rebateInfoStyle}
    >
        <InfoCircleOutlined
            data-testid="rebate-info"
            aria-label="Section 87A rebate — how it is worked out"
            style={{ fontSize: 13, color: '#535862', cursor: 'help' }}
        />
    </Popover>
);

// "5000000 -> ₹50L", "10000000 -> ₹1 Crore" — the four surcharge boundaries are the only
// values this ever sees, so a plain lakh/crore split (unlike formatLakh's rounding) is
// exact and reads the way the surcharge row's own label already does ("above ₹50L").
const formatThreshold = (amount: number) =>
    amount >= 10000000 ? `₹${amount / 10000000} Crore` : formatLakh(amount);

// Explains whichever of the three mutually-exclusive surcharge outcomes actually applied
// this month — no surcharge below ₹50L, a flat rate away from any boundary, or a rate
// capped down by marginal relief right after crossing one. surchargeRate/Threshold/
// BeforeRelief all come straight from the tax engine (services/salary.js), same reasoning
// as rebateLimit above — never re-derived from slab tables on the frontend.
const SurchargeTooltipContent = ({ details }: { details: SalaryProfileTdsDetails }) => {
    const { surchargeRate, surchargeThreshold, surchargeBeforeRelief, surcharge } = details;
    const taxAfterRebate = details.taxBeforeRebate - details.totalRebate;

    // Gated on `surcharge` itself, not `surchargeRate` — `surcharge` has existed since this
    // feature first shipped, so it's always a real number; the rate/threshold/before-relief
    // fields were added afterwards and can be missing on a record computed just before that
    // (or a stale API response), even though `surcharge` itself is already correct.
    if (!surcharge) {
        return (
            <Text className="text-xs" style={{ color: '#535862' }}>
                Surcharge only applies once taxable income exceeds ₹50L. This employee&apos;s taxable income of{' '}
                {fmt(details.taxableIncome)} is below that, so no surcharge applies.
            </Text>
        );
    }

    // A non-zero surcharge with no valid rate/threshold to explain it with — show the
    // amount plainly rather than risk NaN/undefined from missing fields.
    if (!Number.isFinite(surchargeRate) || surchargeRate <= 0 || !Number.isFinite(surchargeThreshold)) {
        return (
            <Space direction="vertical" size={6} className="w-full">
                <Text strong>Surcharge</Text>
                <DetailRow label="Taxable income" value={fmt(details.taxableIncome)} />
                <DetailRow label="Tax before surcharge" value={fmt(taxAfterRebate)} />
                <Divider className="my-1" />
                <DetailRow label="Surcharge" value={fmt(surcharge)} strong />
                <Text className="text-xs" style={{ color: '#535862' }}>
                    Applies once taxable income exceeds ₹50L, at 10–37% of tax depending on how far above.
                </Text>
            </Space>
        );
    }

    const ratePercent = Math.round(surchargeRate * 100);
    const thresholdLabel = formatThreshold(surchargeThreshold);
    const reliefApplied = Number.isFinite(surchargeBeforeRelief) && surchargeBeforeRelief > surcharge;

    if (reliefApplied) {
        return (
            <Space direction="vertical" size={6} className="w-full">
                <Text strong>Surcharge — marginal relief</Text>
                <DetailRow label="Taxable income" value={fmt(details.taxableIncome)} />
                <DetailRow label={`Surcharge rate (above ${thresholdLabel})`} value={`${ratePercent}%`} />
                <DetailRow label="Tax before surcharge" value={fmt(taxAfterRebate)} />
                <DetailRow
                    label={`Normal surcharge — ${ratePercent}% of ${fmt(taxAfterRebate)}`}
                    value={fmt(surchargeBeforeRelief)}
                />
                <Divider className="my-1" />
                <DetailRow label="Surcharge after marginal relief" value={fmt(surcharge)} strong />
                <Text className="text-xs" style={{ color: '#535862' }}>
                    Just above {thresholdLabel}, tax plus surcharge can never grow by more than the income that
                    crossed the limit — so the normal {ratePercent}% is capped down to this amount.
                </Text>
            </Space>
        );
    }

    return (
        <Space direction="vertical" size={6} className="w-full">
            <Text strong>Surcharge</Text>
            <DetailRow label="Taxable income" value={fmt(details.taxableIncome)} />
            <DetailRow label={`Surcharge rate (above ${thresholdLabel})`} value={`${ratePercent}%`} />
            <DetailRow label="Tax before surcharge" value={fmt(taxAfterRebate)} />
            <Divider className="my-1" />
            <DetailRow label={`Surcharge = ${ratePercent}% × ${fmt(taxAfterRebate)}`} value={fmt(surcharge)} strong />
        </Space>
    );
};

const SurchargeInfoIcon = ({ details }: { details: SalaryProfileTdsDetails }) => (
    <Popover
        content={<SurchargeTooltipContent details={details} />}
        trigger="hover"
        placement="left"
        overlayInnerStyle={rebateInfoStyle}
    >
        <InfoCircleOutlined
            data-testid="surcharge-info"
            aria-label="Surcharge — how it is worked out"
            style={{ fontSize: 13, color: '#535862', cursor: 'help' }}
        />
    </Popover>
);

interface DetailRowProps {
    label: React.ReactNode;
    value: React.ReactNode;
    strong?: boolean;
    muted?: boolean;
    // For a label too long to sit beside its value without an ugly mid-wrap (e.g. one
    // naming a full date range) — label takes the full row, value sits right-aligned below.
    stacked?: boolean;
}

const DetailRow = ({ label, value, strong, muted, stacked }: DetailRowProps) => {
    const textStyle = muted ? { color: '#94A3B8' } : undefined;

    if (stacked) {
        return (
            <div style={{ width: '100%' }}>
                <Text style={textStyle} strong={strong}>
                    {label}
                </Text>
                <div style={{ width: '100%', textAlign: 'right' }}>
                    <Text style={textStyle} strong={strong}>
                        {value}
                    </Text>
                </div>
            </div>
        );
    }

    return (
        <Row justify="space-between" wrap={false}>
            <Col flex="auto" style={{ minWidth: 0 }}>
                <Text style={textStyle} strong={strong}>
                    {label}
                </Text>
            </Col>
            <Col>
                <Text style={{ whiteSpace: 'nowrap', ...textStyle }} strong={strong}>
                    {value}
                </Text>
            </Col>
        </Row>
    );
};

const StepCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card size="small" bordered className="rounded-2xl">
        <Space direction="vertical" className="w-full" size={8}>
            <Text strong>{title}</Text>
            {children}
        </Space>
    </Card>
);

interface TDSDetailsDrawerProps {
    open: boolean;
    onClose: () => void;
    details: SalaryProfileTdsDetails | null;
    loading?: boolean;
}

const TDSDetailsDrawer = ({ open, onClose, details, loading }: TDSDetailsDrawerProps) => {
    // fy reads "2026-27" — the engine always projects across the full Apr–Mar year (no
    // DOJ-based mid-year proration exists yet, despite that being the eventual intent), so
    // "12 months" reflects what's actually computed today, not an aspirational window.
    const fyStartYear = details?.fy ? parseInt(details.fy.slice(0, 4), 10) : null;
    const projectionPeriod = fyStartYear
        ? `Apr ${fyStartYear} – Mar ${fyStartYear + 1}`
        : '';

    return (
        <DrawerModal
            open={open}
            handleCancel={onClose}
            modalTitle="TDS Details"
            closeIcon
        >
            {loading || !details ? (
                <Skeleton active paragraph={{ rows: 10 }} />
            ) : (
                <Space direction="vertical" className="w-full" size={20}>
                    <Space direction="vertical" className="w-full" size={12}>
                        <Title level={5}>Employee Details</Title>
                        <DetailRow label="Name" value={details.employeeName} />
                        <DetailRow label="Email" value={details.employeeEmail} />
                        <DetailRow label="Tax Regime" value={details.taxRegime} />
                        <DetailRow label="TDS Frequency" value={details.tdsFrequency} />
                        {details.dateOfJoin ? (
                            <DetailRow label="Date of Joining" value={dayjs(details.dateOfJoin).format('D MMM YYYY')} />
                        ) : null}
                        {projectionPeriod ? (
                            <DetailRow label="TDS calculated for" value={`${projectionPeriod} (12 months)`} strong />
                        ) : null}
                    </Space>

                    <StepCard title="Step 1 — This month's earnings">
                        <DetailRow label="Monthly salary (from the salary structure)" value={fmt(details.monthlySalary)} />
                        <DetailRow label="Gross paid this month" value={fmt(details.grossThisMonth)} strong />
                    </StepCard>

                    <StepCard title="Step 2 — Yearly exemptions">
                        <DetailRow label="Standard deduction" value={fmt(details.standardDeduction)} />
                        <DetailRow
                            label={`Total exemptions (${fmt(details.exemptions / 12)} per month)`}
                            value={fmt(details.exemptions)}
                            strong
                        />
                    </StepCard>

                    <StepCard title="Step 3 — Taxable income">
                        {/* Period intentionally omitted here (unlike Step 4/5's totals) — it's
                            already stated once, right above, in "TDS calculated for", and
                            repeating it made this label too long to fit beside its value
                            without wrapping mid-sentence.
                            NOTE: shows monthlySalary × 12 literally, per explicit request — for a
                            month with a one-time payment (arrears/bonus/etc.) folded into
                            monthlySalary, this will overstate the true annual figure and will not
                            match "Annual taxable income" below, which is correctly derived from
                            the real grossAnnual regardless. */}
                        <DetailRow
                            label={`Salary for the year: ${fmt(details.monthlySalary)} × 12 months`}
                            value={fmt(details.monthlySalary * 12)}
                        />
                        <DetailRow label="Less: yearly exemptions" value={`− ${fmt(details.exemptions)}`} />
                        <DetailRow label="Annual taxable income" value={fmt(details.taxableIncome)} strong />
                    </StepCard>

                    <StepCard title="Step 4 — Tax on that income (slab by slab)">
                        <Card size="small" bordered className="rounded-xl bg-[#F8FAFC]">
                            <Space direction="vertical" className="w-full" size={6}>
                                {details.slabBreakdown.map(slab => (
                                    <DetailRow
                                        key={`${slab.from}-${slab.to}-${slab.rate}`}
                                        label={
                                            slab.to != null
                                                ? `${formatLakh(slab.from)}–${formatLakh(slab.to)} @${slab.rate}%`
                                                : `Above ${formatLakh(slab.from)} @${slab.rate}%`
                                        }
                                        value={`= ${fmt(slab.tax)}`}
                                    />
                                ))}
                            </Space>
                        </Card>
                        <DetailRow label="Total slab tax" value={`= ${fmt(details.taxBeforeRebate)}`} strong />
                        <DetailRow
                            label={
                                <Space size={4}>
                                    <span>{rebateRowLabel(details.taxRegime, details.marginalRelief)}</span>
                                    <RebateInfoIcon details={details} />
                                </Space>
                            }
                            value={`− ${fmt(details.totalRebate)}`}
                            muted={details.totalRebate === 0}
                        />
                        <DetailRow
                            label={
                                <Space size={4}>
                                    <span>Add: Surcharge (taxable income above ₹50L)</span>
                                    <SurchargeInfoIcon details={details} />
                                </Space>
                            }
                            value={`+ ${fmt(details.surcharge)}`}
                            muted={details.surcharge === 0}
                        />
                        <DetailRow
                            label={`Add: Health & Education Cess — 4% of ${fmt(details.taxBeforeRebate - details.totalRebate + details.surcharge)}`}
                            value={`+ ${fmt(details.cess)}`}
                        />
                        <DetailRow
                            label={projectionPeriod ? `Total Tax Payable (${projectionPeriod})` : 'Total Tax Payable'}
                            value={fmt(details.totalTax)}
                            strong
                        />
                    </StepCard>

                    <StepCard title="Step 5 — This month's TDS">
                        {/* No special case for a month with a one-off (arrears/bonus/etc.) — it's
                            already folded into the complete projected annual income Step 3/4
                            worked from, so the annual tax above already reflects it, and this is
                            always simply that annual tax spread evenly across the year. */}
                        <DetailRow
                            label={
                                projectionPeriod
                                    ? `Tax on salary ${fmt(details.totalTax)} ÷ 12 months (${projectionPeriod})`
                                    : `Tax on salary ${fmt(details.totalTax)} ÷ 12 months`
                            }
                            value={fmt(details.tdsMonthly)}
                        />
                        <DetailRow label="Monthly TDS Deduction" value={fmt(details.tdsMonthly)} strong />
                    </StepCard>
                </Space>
            )}
        </DrawerModal>
    );
};

export default TDSDetailsDrawer;
