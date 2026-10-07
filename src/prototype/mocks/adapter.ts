// PROTOTYPE-SETUP: axios adapter that answers every ApiClient request from the mock route table instead of
// the network. Only the transport is replaced: ApiClient's request/response interceptors still run, so a
// mock response reaches callers exactly as a real one would (the response interceptor unwraps the body).
import { AxiosError } from 'axios';
import type { AxiosAdapter, AxiosResponse } from 'axios';

import { DataMode, RawBody, ok } from './envelope';
import { MockHttpError } from './errors';
import { mockRoutes } from './index';
import { setCurrentRequestParams } from './requester';
import { HttpMethod, MockRoute, findRoute, normaliseRequest, parseBody } from './router';

const MIN_DELAY_MS = 150;
const MAX_DELAY_MS = 300;

const sleep = (ms: number) =>
    new Promise<void>(resolve => {
        setTimeout(resolve, ms);
    });

const warned = new Set<string>();
const warnUnmocked = (method: HttpMethod, path: string) => {
    const key = `${method} ${path}`;
    if (warned.has(key)) return;
    warned.add(key);
    // eslint-disable-next-line no-console
    console.warn(`[prototype-mock] unmocked ${key}`);
};

export const createPrototypeMockAdapter =
    (getMode: () => DataMode, routes: MockRoute[] = mockRoutes): AxiosAdapter =>
    async config => {
        const method = (config.method ?? 'get').toUpperCase() as HttpMethod;
        const { path, query } = normaliseRequest(config.url, config.baseURL, config.params);

        await sleep(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));

        let body: unknown;
        const match = findRoute(routes, method, path);
        if (match) {
            try {
                setCurrentRequestParams(match.params); // lets ESS handlers resolve the persona (requester.ts)
                const result = await match.route.handle({
                    params: match.params,
                    query,
                    body: parseBody(config.data),
                    mode: getMode(),
                    path,
                });
                body = result instanceof RawBody ? result.body : ok(result ?? {});
            } catch (error) {
                if (error instanceof MockHttpError) {
                    // Deliberate rejection (validation / conflict): behave like a real 4xx from the server.
                    const errorResponse: AxiosResponse = {
                        data: { status: false, message: error.message, responseCode: String(error.status) },
                        status: error.status,
                        statusText: 'Mock error',
                        headers: {},
                        config,
                        request: { prototypeMock: true },
                    };
                    throw new AxiosError(error.message, 'ERR_BAD_REQUEST', config, errorResponse.request, errorResponse);
                }
                // A broken handler must not take the demo down; log it loudly and answer empty.
                console.error(`[prototype-mock] handler failed for ${method} ${path}`, error);
                body = ok({});
            }
        } else {
            warnUnmocked(method, path);
            body = ok({});
        }

        const response: AxiosResponse = {
            data: body,
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            request: { prototypeMock: true },
        };
        return response;
    };
