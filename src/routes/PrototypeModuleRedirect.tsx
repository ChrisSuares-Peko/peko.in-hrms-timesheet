// PROTOTYPE-SETUP: catch-all for the isolated prototype. Any route belonging to a service outside the
// prototype module (including /dashboard and /more-services/*) is replaced with the module's landing
// route, so hidden services are unreachable by URL instead of showing an access-denied page. Routes that
// are not services (profile, notifications, plans, payments...) pass through untouched.
import { Navigate, useLocation } from 'react-router-dom';

import { paths } from '@src/routes/paths';
import { MORE_SERVICES_PREFIX } from '@utils/serviceRoute';
import { HIDDEN_SERVICE_ROUTES } from '@utils/staticCorporateServiceAccess';

export const PROTOTYPE_LANDING_ROUTE = paths.dashboard.payroll;

const matches = (pathname: string, route: string) =>
    pathname === route || pathname.startsWith(`${route}/`);

export default function PrototypeModuleRedirect({ children }: { children: React.ReactNode }) {
    const pathname = useLocation().pathname.toLowerCase().replace(/\/+$/, '') || '/';

    const isHiddenService =
        matches(pathname, MORE_SERVICES_PREFIX) ||
        HIDDEN_SERVICE_ROUTES.some(route => matches(pathname, route.toLowerCase()));

    if (isHiddenService) {
        return <Navigate to={PROTOTYPE_LANDING_ROUTE} replace />;
    }
    return <>{children}</>;
}
