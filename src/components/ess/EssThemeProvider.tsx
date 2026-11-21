// PROTOTYPE-SETUP (ESS design, Slice 1; Design update: Peko design language): the ESS layout's theme is the shared
// Peko scope (src/components/peko/PekoScope.tsx), so ESS and the Payroll redesign screens use one theme layer nested
// in the global Peko theme. Mounted once on EssLayout; modals and drawers inherit it through portals. ess.css keeps
// the scoped overrides for the pages ESS shares with the /employee portal.
import { ReactNode } from 'react';

import PekoScope, { pekoTheme } from '@src/components/peko/PekoScope';

import './ess.css';

/** The ESS theme is the Peko scope's theme (kept under this name for the Demo control). */
export const essTheme = pekoTheme;

const EssThemeProvider = ({ children }: { children: ReactNode }) => <PekoScope className="ess-scope">{children}</PekoScope>;

export default EssThemeProvider;
