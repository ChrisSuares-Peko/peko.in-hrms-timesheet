// PROTOTYPE-SETUP: response envelope + data-mode helpers shared by every mock handler.
import type { DataMode } from '@src/slices/dataModeSlice';

export type { DataMode };

/** Same shape as SuccessGenericResponse<T> — what ApiClient's response interceptor hands to callers. */
export interface MockEnvelope<T> {
    status: boolean;
    message: string;
    responseCode: string;
    data: T;
}

export const ok = <T>(data: T, message = 'OK'): MockEnvelope<T> => ({
    status: true,
    message,
    responseCode: '000',
    data,
});

/**
 * A dataset in both modes. Typed with the endpoint's real response type, so the type-check forces
 * `empty` to be a complete, valid shape (empty arrays, zero totals) rather than null.
 */
export interface ModeData<T> {
    dummy: T;
    empty: T;
}

export const byMode = <T>(mode: DataMode, data: ModeData<T>): T =>
    mode === 'empty' ? data.empty : data.dummy;

/**
 * Wrap a handler's return value in `raw()` to send that object as the whole response body instead of
 * `ok(value)` — for the few callers that read the envelope itself rather than `res.data`.
 */
export class RawBody {
    constructor(public readonly body: unknown) {}
}

export const raw = (body: unknown) => new RawBody(body);
