import { useCallback, useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { UserRole } from '@customtypes/general';
import { holdsCardMembership } from '@src/domains/dashboard/corporateCards/utils/activeRole';
import { useAppSelector } from '@src/hooks/store';
import { paths } from '@src/routes/paths';

type CorporateUserGuardProps = {
    children: React.ReactNode;
};

export default function CorporateUserGuard({ children }: CorporateUserGuardProps) {
    const navigate = useNavigate();

    const { role, employeeProfileId, serviceMemberships } = useAppSelector(
        state => state.reducer.auth
    );

    const [checked, setChecked] = useState(false);

    const check = useCallback(() => {
        if (role === UserRole.SYSTEM) {
            const href = paths.systemUser.dashboard;
            navigate(href, { replace: true });
            // An employee who also holds a card membership belongs in this shell — that is what puts both
            // services in one sidebar. A payroll-only employee still has nothing here and is sent back.
        } else if (
            role === UserRole.EMPLOYEE &&
            !holdsCardMembership(role, employeeProfileId, serviceMemberships)
        ) {
            navigate(paths.employee.home, { replace: true });
        } else {
            setChecked(true);
        }
    }, [navigate, role, employeeProfileId, serviceMemberships]);

    useEffect(() => {
        check();
    }, [check]);

    if (!checked) {
        return null;
    }

    return <>{children}</>;
}
