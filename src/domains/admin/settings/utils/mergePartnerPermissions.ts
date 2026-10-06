import { Permission } from '../types/partnerPermission';

// Stable per-service identity. Labels are NOT unique — the catalogue ships two
// "Corporate Cards" entries (accessKeys `corporate_card` / `peko_corporate_cards`).
export const permissionKey = (permission: Permission) => permission.accessKey ?? permission.label;

// Merge a partner's saved permission tree onto the service catalogue
// (`partner-initial-sidebar`). The catalogue defines WHICH services exist; the saved
// tree supplies access, alias, icon, the "More Services" flag and the ORDER.
//
// Every screen that writes `partnerPermission.permissions` must go through this —
// the backend replaces the whole tree on save, so any field dropped here is wiped
// from the partner (this is how Edit Partner was erasing icons / More Services).
export const mergeSavedPermissions = (
    catalogue: Permission[],
    savedInput: Permission[] | string | null | undefined
): Permission[] => {
    const merged: Permission[] = JSON.parse(JSON.stringify(catalogue));

    // A raw read of the JSON column can come back as a string.
    let saved: unknown = savedInput;
    if (typeof saved === 'string') {
        try {
            saved = JSON.parse(saved);
        } catch {
            saved = null;
        }
    }
    if (!Array.isArray(saved) || saved.length === 0) return merged;
    const savedList = saved as Permission[];

    // Trees saved before `accessKey` was stored only carry `label`; fall back to it
    // for those entries so their access/order still carry over.
    const findSaved = (category: Permission) =>
        savedList.find(s => permissionKey(s) === permissionKey(category)) ??
        savedList.find(s => !s.accessKey && s.label === category.label);

    const savedPosition = new Map<Permission, number>();
    merged.forEach(category => {
        const existing = findSaved(category);
        if (!existing) return;
        savedPosition.set(category, savedList.indexOf(existing));

        category.hasAccess = existing.hasAccess;
        category.alias = existing.alias;
        category.icon = existing.icon;
        category.enableMoreService = existing.enableMoreService;

        if (category.subServices?.length) {
            category.subServices = category.subServices.map(sub => {
                const existingSub = existing.subServices?.find(s => s.label === sub.label);
                return existingSub ? { ...sub, hasAccess: existingSub.hasAccess } : sub;
            });
        }
    });

    // Restore the saved order. Services added to the catalogue since the last save
    // sort to the end; `sort` is stable so they keep catalogue order among themselves.
    return merged.sort(
        (a, b) =>
            (savedPosition.get(a) ?? Number.MAX_SAFE_INTEGER) -
            (savedPosition.get(b) ?? Number.MAX_SAFE_INTEGER)
    );
};
