// PROTOTYPE-SETUP: shared layout for both ESS sidebar tabs ("ESS - Employee", "ESS - Manager"). Mounts the
// existing ESS portal pages from src/domains/employee inside the corporate dashboard layout (so the sidebar
// stays visible). There is no in-page tab row or page heading: the ESS Home dashboard links to every page
// through its cards, and the layout's breadcrumb ("ESS - Employee > <page>") leads back to Home
// (see src/prototype/persona/essBreadcrumb.tsx).
import { Suspense, useEffect, useState } from 'react';

import { Skeleton } from 'antd';
import { Outlet, useLocation } from 'react-router-dom';

import EssThemeProvider from '@src/components/ess/EssThemeProvider';
import { getAtsSettings } from '@src/domains/attendanceTimesheet/api';
import type { AtsMode } from '@src/domains/attendanceTimesheet/types';
import { directReportsOf } from '@src/prototype/mocks/data/employees';
import { ESS_TABS, essTabFor } from '@src/prototype/persona/essPersonas';

/** Outlet context the ESS tab layout gives its pages. Absent on the real /employee portal. */
export interface EssOutletContext {
    atsMode?: AtsMode;
    /** The tab's persona has direct reports. */
    isManager: boolean;
}

const EssLayout = () => {
    const { pathname } = useLocation();
    const tab = essTabFor(pathname) ?? ESS_TABS[0];
    const [atsMode, setAtsMode] = useState<AtsMode | undefined>(undefined);

    useEffect(() => {
        getAtsSettings({ userType: 'user', userId: tab.persona.id }).then(s => s && setAtsMode(s.mode));
    }, [tab.persona.id]);

    const isManager = directReportsOf(tab.persona.employeeId).length > 0;

    return (
        // PROTOTYPE-SETUP (ESS design, Slice 1): every ESS page (both tabs) renders inside the ESS theme.
        <EssThemeProvider>
            <Suspense fallback={<Skeleton active paragraph={{ rows: 6 }} />}>
                <Outlet context={{ atsMode, isManager } satisfies EssOutletContext} />
            </Suspense>
        </EssThemeProvider>
    );
};

export default EssLayout;
