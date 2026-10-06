import { ServicesListResponse } from '@customtypes/general';
import { staticPartnerPermissions } from '@domains/admin/settings/utils/staticPartnerPermissions';
import { toServiceRoute } from '@utils/serviceRoute';

/**
 * TEMPORARY static corporate `serviceAccess` data reflecting the new flattened
 * structure — the `"More Services"` category is removed and its services sit at
 * the top level, each carrying `enableMoreService: true` (and an `icon` slot).
 *
 * Used while the backend `user/services/serviceAccess` change is pending. Derived
 * from the shared partner catalogue (`staticPartnerPermissions`) so the admin and
 * corporate mocks stay in sync. Remove this file and switch back to the live
 * `getUserServices()` response once the backend returns the flattened shape.
 *
 * NOTE: every service is marked `hasAccess: true` so the flattened structure is
 * fully visible during development; the backend will drive real access per user.
 */
// PROTOTYPE-SETUP: the full catalogue is kept (unexported) so the hidden services' routes can be redirected.
const fullCorporateServiceAccess: ServicesListResponse['data'] =
    staticPartnerPermissions.map(permission => ({
        serviceCategory: permission.label,
        label: permission.label,
        hasAccess: true,
        services: [],
        subServices: (permission.subServices ?? []).map(subService => ({
            label: subService.label,
            hasAccess: true,
        })),
        enableMoreService: permission.enableMoreService ?? false,
        icon: permission.icon ?? '',
    }));

// PROTOTYPE-SETUP: the two ESS prototype entries. `label` drives the route (/ess-employee, /ess-manager) and
// matches what CorporateAccessGuard derives from the URL; `alias` is the sidebar display name.
const prototypeEssServices: ServicesListResponse['data'] = [
    {
        serviceCategory: 'ESS Employee',
        label: 'ESS Employee',
        alias: 'ESS - Employee',
        hasAccess: true,
        services: [],
        subServices: [],
        enableMoreService: false,
        icon: '',
    },
    {
        serviceCategory: 'ESS Manager',
        label: 'ESS Manager',
        alias: 'ESS - Manager',
        hasAccess: true,
        services: [],
        subServices: [],
        enableMoreService: false,
        icon: '',
    },
];

// PROTOTYPE-SETUP: SIDEBAR_MODE "only-this-module" — the prototype module is these three entries, in this order.
export const PROTOTYPE_SERVICE_LABELS = ['Payroll', 'ESS Employee', 'ESS Manager'];

// PROTOTYPE-SETUP: filtered at the source so the sidebar and the access guards see the same list.
export const staticCorporateServiceAccess: ServicesListResponse['data'] = [
    ...fullCorporateServiceAccess,
    ...prototypeEssServices,
]
    .filter(service => PROTOTYPE_SERVICE_LABELS.includes(service.label))
    .sort(
        (a, b) =>
            PROTOTYPE_SERVICE_LABELS.indexOf(a.label) - PROTOTYPE_SERVICE_LABELS.indexOf(b.label)
    );

// PROTOTYPE-SETUP: routes of every catalogue service outside the prototype; PrototypeModuleRedirect sends
// these (and /more-services/*) to the module's landing route instead of an access-denied page.
export const HIDDEN_SERVICE_ROUTES: string[] = fullCorporateServiceAccess
    .filter(service => !PROTOTYPE_SERVICE_LABELS.includes(service.label))
    .map(service => toServiceRoute(service.label, service.enableMoreService));

export default staticCorporateServiceAccess;
