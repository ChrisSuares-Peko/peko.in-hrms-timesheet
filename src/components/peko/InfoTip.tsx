// PROTOTYPE-SETUP (Leave settings rework: Peko One help text): explanations, rules, policy notes and worked examples
// live in a tooltip, not on screen. A 13px grey info icon (antd InfoCircleOutlined, #8993A4) next to the field label,
// panel title or button shows an antd Tooltip on hover or keyboard focus — the same pattern as "Rollout Salary" in the
// Payroll code (src/domains/dashboard/Payroll/utils/salaryEmployeesColumns/activeEmployees.tsx).
import type { ReactNode } from 'react';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';

const InfoTip = ({ title, label = 'More information', placement = 'top', ...rest }: { title: ReactNode; label?: string; placement?: 'top' | 'right' | 'bottom' | 'left' | 'topLeft' | 'topRight' } & Record<`data-${string}`, unknown>) => (
    <Tooltip title={title} placement={placement} trigger={['hover', 'focus']} styles={{ root: { maxWidth: 360 } }}>
        <span role="button" tabIndex={0} aria-label={label} className="peko-infotip" data-infotip {...rest}>
            <InfoCircleOutlined />
        </span>
    </Tooltip>
);

/** A label (or title) with an info tip after it. */
export const WithTip = ({ children, tip, label }: { children: ReactNode; tip?: ReactNode; label?: string }) => (
    <span className="inline-flex items-center">
        {children}
        {tip ? <InfoTip title={tip} label={label} /> : null}
    </span>
);

export default InfoTip;
