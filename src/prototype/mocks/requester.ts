// PROTOTYPE-SETUP: who an ESS (employee self-service) request is made as.
// The ESS tabs run as employee personas (see src/prototype/persona): their requests arrive as
// `user/<employee id>/payroll/...`, so the persona is read from the matched `:type/:uid`. Anything else
// (e.g. an ESS page outside a persona scope, `corporate/1001/...`) falls back to the ESS - Employee persona.
//
// The adapter records the matched params immediately before invoking each handler. Handlers run
// synchronously up to their first await, so call essRequester() at the top of a handler, never after one.
import { ESS_EMPLOYEE, MockEmployee, findEmployee } from './data/employees';
import type { MockContext } from './router';

let currentParams: MockContext['params'] = {};

export const setCurrentRequestParams = (params: MockContext['params']) => {
    currentParams = params;
};

export const essRequester = (): MockEmployee =>
    (currentParams.type?.toLowerCase() === 'user' ? findEmployee(currentParams.uid) : undefined) ??
    ESS_EMPLOYEE;
