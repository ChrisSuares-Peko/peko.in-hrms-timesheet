// PROTOTYPE-SETUP (Payroll settings → ESS — notes pay:settings:ess): Payslips and My pay belong to the Payroll service
// and stay hidden in ESS until the company turns them on (settings.essShow). A page that's off isn't reachable by a
// direct link either: it goes to the ESS Overview. Employees and managers alike.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Empty, Skeleton } from 'antd';
import { Navigate } from 'react-router-dom';

import { getAtsSettings } from '../api';
import { useAtsPaths } from '../hooks/useAtsPaths';
import { useAtsScope } from '../hooks/useAtsScope';
import type { EssShow } from '../types';

export const EssFeatureGate = ({ feature, children }: { feature: keyof EssShow; children: ReactNode }) => {
    const scope = useAtsScope();
    const paths = useAtsPaths();
    const [on, setOn] = useState<boolean | null>(null);
    useEffect(() => {
        let live = true;
        getAtsSettings(scope).then(s => {
            if (live) setOn(Boolean(s && s.essShow?.[feature]));
        });
        return () => {
            live = false;
        };
    }, [scope, feature]);
    if (on === null) return <Skeleton active paragraph={{ rows: 4 }} />;
    if (!on) return <Navigate to={paths.home} replace />;
    return <>{children}</>;
};

/**
 * My pay: salary structure, earnings, deductions and tax details. The page itself belongs to the Payroll service (not
 * part of this prototype); only its visibility is built here, so it shows a placeholder.
 */
export const MyPayPlaceholder = () => (
    <div className="rounded-lg border border-solid border-[var(--peko-border)] bg-white p-8" data-my-pay>
        <h1 className="m-0 mb-4 text-xl font-semibold text-[var(--peko-text)]">My pay</h1>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Your salary structure, earnings, deductions and tax details will show here." />
    </div>
);
