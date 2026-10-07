// PROTOTYPE-SETUP: runs one subtree as an employee persona from the master list (data/employees.ts).
// Payroll stays the corporate admin (MOCK_AUTHENTICATED_USER); the ESS tabs need an employee identity,
// because the ESS hooks only fetch when `auth.role === 'user'`. Instead of editing those checks, this
// re-provides the SAME store to the subtree with `auth` read as the persona. Dispatches and subscriptions
// go to the real store, and nothing outside the subtree (sidebar, header, Payroll) sees the persona.
import { useMemo } from 'react';

import { Provider, useStore } from 'react-redux';

import { UserRole } from '@customtypes/general';
import type { MockEmployee } from '@src/prototype/mocks/data/employees';
import type { RootState } from '@store/store';

import PersonaBanner from './PersonaBanner';

type AuthState = RootState['reducer']['auth'];

const personaAuth = (base: AuthState, employee: MockEmployee): AuthState => ({
    ...base,
    role: UserRole.EMPLOYEE,
    roleName: 'employee',
    id: employee.id,
    username: employee.email,
    name: employee.fullName,
    email: employee.email,
    mobileNo: employee.mobileNo,
    employeeId: employee.employeeId,
    employeeProfileId: employee.id,
    employeeName: employee.fullName,
    employeeEmail: employee.email,
    employeeMobile: employee.mobileNo,
});

type PersonaScopeProps = {
    employee: MockEmployee;
    /** Shown in the banner, e.g. "ESS - Employee". */
    label: string;
    children: React.ReactNode;
};

export default function PersonaScope({ employee, label, children }: PersonaScopeProps) {
    const store = useStore<RootState>();

    const scopedStore = useMemo(() => {
        // Memoised so selectors see stable references: a new state object only when the real one changes,
        // and a new auth object only when the real auth changes.
        let lastBase: RootState | undefined;
        let lastBaseAuth: AuthState | undefined;
        let scopedAuth: AuthState | undefined;
        let scopedState: RootState | undefined;
        const getState = (): RootState => {
            const base = store.getState();
            if (base !== lastBase) {
                if (base.reducer.auth !== lastBaseAuth) {
                    lastBaseAuth = base.reducer.auth;
                    scopedAuth = personaAuth(base.reducer.auth, employee);
                }
                lastBase = base;
                scopedState = { ...base, reducer: { ...base.reducer, auth: scopedAuth! } };
            }
            return scopedState!;
        };
        return { ...store, getState };
    }, [store, employee]);

    return (
        <Provider store={scopedStore}>
            <PersonaBanner employee={employee} label={label} />
            {children}
        </Provider>
    );
}
