// PROTOTYPE-SETUP: the ESS pages are mounted under /employee (real portal) and under the two prototype
// sidebar tabs (/ess-employee, /ess-manager). Links must stay under whichever base the page is rendered
// in; under /employee nothing changes. Returns a path set with the same keys as paths.employee.
import { useContext } from 'react';

import { UNSAFE_LocationContext as LocationContext } from 'react-router-dom';

import { essTabFor } from '@src/prototype/persona/essPersonas';
import { paths } from '@src/routes/paths';

// Every paths.employee key resolved inside the tab; pages not mounted on the tabs (e.g. onboarding) fall
// back to the tab's home, so a link can never leave the tab.
const mapToTab = (tabPaths: Record<string, string>) =>
    Object.fromEntries(
        Object.keys(paths.employee).map(key => [key, tabPaths[key] ?? tabPaths.home])
    ) as Record<string, string>;

export const useEmployeePaths = (): Record<string, string> => {
    const pathname = useContext(LocationContext)?.location?.pathname ?? '';
    const tab = essTabFor(pathname);
    return tab ? mapToTab(tab.paths) : paths.employee;
};
