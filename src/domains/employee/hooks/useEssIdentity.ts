// PROTOTYPE-SETUP: the identity the ESS pages act as.
// On an ESS sidebar tab (/ess-employee, /ess-manager) it is that tab's employee persona, as role 'user'.
// Anywhere else — the real /employee portal, or outside a router (unit tests) — it is the logged-in session,
// exactly what these pages read from state.reducer.auth before. The global auth state is never changed.
import { useContext } from 'react';

// Location context is null outside a router, so this works in tests without a conditional hook call.
import { UNSAFE_LocationContext as LocationContext } from 'react-router-dom';

import { useAppSelector } from '@src/hooks/store';
import { essTabFor } from '@src/prototype/persona/essPersonas';

export interface EssIdentity {
    id: number;
    role: string;
    username: string;
}

export const useEssIdentity = (): EssIdentity => {
    const { id, role, username } = useAppSelector(state => state.reducer.auth);
    const pathname = useContext(LocationContext)?.location?.pathname;
    const tab = pathname ? essTabFor(pathname) : undefined;
    if (tab) {
        return { id: tab.persona.id, role: 'user', username: tab.persona.email };
    }
    return { id, role, username };
};

export default useEssIdentity;
