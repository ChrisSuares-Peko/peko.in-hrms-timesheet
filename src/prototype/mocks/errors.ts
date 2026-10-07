// PROTOTYPE-SETUP: deliberate HTTP errors from mock handlers (validation / conflict).
/**
 * Throw `fail(status, message)` from a handler to answer with an HTTP error (e.g. 409 for an overlapping
 * timesheet entry). The adapter rejects like a real 4xx, so ApiClient's error interceptor shows the message
 * as a toast and the API function's catch branch runs.
 */
export class MockHttpError extends Error {
    constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
    }
}

export const fail = (status: number, message: string) => new MockHttpError(status, message);
