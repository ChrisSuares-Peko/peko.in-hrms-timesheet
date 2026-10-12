// PROTOTYPE-SETUP (Overview, Slice 4): the ESS tab persona's approved profile photo (null = show initials), for
// the header and the Profile page. Read straight from the in-browser mock store, again on every navigation, so a
// photo HR approves in Payroll shows as soon as you're back on the ESS tab.
import { useLocation } from 'react-router-dom';

import { useAppSelector } from '@src/hooks/store';
import type { MockEmployee } from '@src/prototype/mocks/data/employees';
import { personalOf } from '@src/prototype/mocks/store/atsProfile';

export const useEssPersonaPhoto = (persona: MockEmployee | undefined): string | null => {
    const dataMode = useAppSelector(state => state.reducer.dataMode?.mode ?? 'dummy');
    useLocation();
    return persona ? personalOf(dataMode, persona).photo : null;
};

export default useEssPersonaPhoto;
