// PROTOTYPE-SETUP: the ESS pages are also mounted under /ess-employee (inside the corporate layout). Links
// must stay under whichever base the page is rendered in; under /employee nothing changes.
import { useLocation } from 'react-router-dom';

import { paths } from '@src/routes/paths';

export const useEmployeePaths = (): Record<string, string> => {
    const { pathname } = useLocation();
    return pathname.startsWith(paths.essEmployee.index) ? paths.essEmployee : paths.employee;
};
