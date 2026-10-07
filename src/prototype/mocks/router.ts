// PROTOTYPE-SETUP: endpoint matching for the prototype mock layer.
// Patterns are react-router path patterns (no new dependency), written without a leading slash and
// relative to ApiClient's baseURL, e.g. ':type/:uid/payroll/employee/:employeeId'.
import { matchPath } from 'react-router-dom';

import type { DataMode } from './envelope';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface MockContext {
    /** Path params from the route pattern (always includes `type`/`uid` when the pattern has them). */
    params: Record<string, string | undefined>;
    /** Axios `params` merged with any query string already in the URL. */
    query: Record<string, any>;
    /** Parsed JSON request body, or the raw value (e.g. FormData) when it is not JSON. */
    body: any;
    mode: DataMode;
    /** Normalised path that was matched, for logging. */
    path: string;
}

export interface MockRoute {
    method: HttpMethod;
    path: string;
    handle: (ctx: MockContext) => unknown | Promise<unknown>;
}

export const route = (
    method: HttpMethod,
    path: string,
    handle: MockRoute['handle']
): MockRoute => ({ method, path, handle });

/** Strip baseURL, query string and leading/duplicate slashes; collect query params. */
export const normaliseRequest = (
    url: string | undefined,
    baseURL: string | undefined,
    params: Record<string, any> | undefined
) => {
    let path = url ?? '';
    if (baseURL && path.startsWith(baseURL)) path = path.slice(baseURL.length);
    path = path.replace(/^https?:\/\/[^/]+/, '');

    const query: Record<string, any> = {};
    const qIndex = path.indexOf('?');
    if (qIndex !== -1) {
        new URLSearchParams(path.slice(qIndex + 1)).forEach((value, key) => {
            query[key] = value;
        });
        path = path.slice(0, qIndex);
    }
    Object.assign(query, params ?? {});

    path = path.replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
    return { path, query };
};

export const parseBody = (data: unknown) => {
    if (typeof data !== 'string') return data;
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
};

export const findRoute = (routes: MockRoute[], method: HttpMethod, path: string) => {
    let found: { route: MockRoute; params: MockContext['params'] } | null = null;
    routes.some(candidate => {
        if (candidate.method !== method) return false;
        const match = matchPath({ path: `/${candidate.path}`, end: true }, `/${path}`);
        if (match) found = { route: candidate, params: match.params };
        return Boolean(match);
    });
    return found as { route: MockRoute; params: MockContext['params'] } | null;
};
