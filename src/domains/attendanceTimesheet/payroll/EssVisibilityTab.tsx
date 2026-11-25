// PROTOTYPE-SETUP (Payroll settings → ESS — notes pay:settings:ess): "What employees see in ESS". Payslips and My pay
// belong to the Payroll service and stay hidden in ESS until the company turns them on (both off by default). A switch
// applies straight away: the ESS menu, the Overview's Payslips tile and direct links follow it, for employees and
// managers alike. Nothing is deleted. Stored as settings.essShow = { payslips, mypay }.
import { useEffect, useState } from 'react';

import { Card, Flex, Skeleton, Switch, Typography } from 'antd';

import InfoTip from '@src/components/peko/InfoTip';
import { useAppDispatch } from '@src/hooks/store';
import { showToast } from '@src/slices/apiSlice';

import { getAtsSettings, updateAtsSettings } from '../api';
import type { EssShow } from '../types';
import { usePayrollScope } from './usePayrollAts';

const { Text } = Typography;

const ROWS: { key: keyof EssShow; label: string; line: string }[] = [
    { key: 'payslips', label: 'Payslips', line: 'Monthly payslips in ESS. Hidden until you turn it on, for example once payroll has run in Peko.' },
    { key: 'mypay', label: 'My pay', line: 'Salary structure, earnings, deductions and tax details in ESS. Hidden until you turn it on.' },
];

const EssVisibilityTab = () => {
    const scope = usePayrollScope();
    const dispatch = useAppDispatch();
    const [show, setShow] = useState<EssShow | null>(null);
    const [saving, setSaving] = useState<keyof EssShow | null>(null);
    useEffect(() => {
        getAtsSettings(scope).then(s => s && setShow(s.essShow));
    }, [scope]);
    const toggle = async (key: keyof EssShow, on: boolean) => {
        if (!show) return;
        setSaving(key);
        const res = await updateAtsSettings(scope, { essShow: { ...show, [key]: on } });
        setSaving(null);
        if (!res) return;
        setShow(res.essShow);
        const {label} = (ROWS.find(r => r.key === key)!);
        dispatch(showToast({ variant: 'success', description: on ? `${label} is now visible to employees in ESS.` : `${label} is hidden from employees in ESS.` }));
    };
    return (
        <Card
            size="small"
            className="max-w-[720px]"
            data-ess-visibility
            title={
                <span className="inline-flex items-center">
                    What employees see in ESS
                    <InfoTip
                        label="About ESS visibility"
                        title="Some ESS pages stay hidden until your company is ready to use them. Turning one on adds it to every employee’s ESS menu (and Payslips to the Overview quick actions) straight away; turning it off hides it again, including direct links. Nothing is deleted."
                    />
                </span>
            }
        >
            {!show ? (
                <Skeleton active paragraph={{ rows: 2 }} />
            ) : (
                <Flex vertical>
                    {ROWS.map(r => (
                        <Flex key={r.key} align="center" gap={16} className="border-0 border-b border-solid border-[var(--peko-line)] py-3 last:border-b-0" data-ess-row={r.key}>
                            <div className="min-w-0 flex-1">
                                <Text className="block text-sm font-medium">{r.label}</Text>
                                <Text type="secondary" className="block text-xs">
                                    {r.line}
                                </Text>
                                <Text className={`text-xs ${show[r.key] ? '!text-[var(--peko-success-ink)]' : '!text-[var(--peko-muted)]'}`} data-ess-status={r.key}>
                                    {show[r.key] ? 'Visible to employees' : 'Hidden from employees'}
                                </Text>
                            </div>
                            <Switch checked={show[r.key]} loading={saving === r.key} onChange={on => toggle(r.key, on)} aria-label={r.label} data-ess-switch={r.key} />
                        </Flex>
                    ))}
                </Flex>
            )}
        </Card>
    );
};

export default EssVisibilityTab;
