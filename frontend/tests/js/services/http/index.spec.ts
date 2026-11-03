import { http as route, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';

import { checkResponse, deleteRequest, getRequest, putRequest, SessionEndedError, setUnauthenticatedHandler, UnexpectedResponseError, versionFrom } from '@/services/http';

// msw answers the real axios instance's requests, so the interceptor runs
// exactly as in the app, and src/ exports nothing just for this test.
// 'error': a request with no handler below fails the test instead of trying
// the network.
const server = setupServer();

// A made-up endpoint: these tests are about the interceptor, not any route.
const respondWith = (status: number) =>
    server.use(route.get('/api/probe', () => HttpResponse.json({ message: 'Response' }, { status })));

// File level: every describe below sends real requests through msw.
beforeAll(() =>
{
    server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() =>
{
    server.resetHandlers();
});

afterAll(() =>
{
    server.close();
});

describe('http', () =>
{
    // Returns whether it ended a session; each test sets the answer it needs.
    const handler = vi.fn<() => boolean>();

    beforeEach(() =>
    {
        vi.resetAllMocks();
        // One slot, so this replaces whatever an earlier test set.
        setUnauthenticatedHandler(handler);
    });

    it('should reject with a SessionEndedError carrying the 401 (unauthenticated) when the handler ended the session', async () =>
    {
        // Arrange: a logged-in user's session is gone, so the handler ends it
        handler.mockReturnValue(true);
        respondWith(401);

        // Act
        const error: unknown = await getRequest('/probe').catch((rejection: unknown) => rejection);

        // Assert: marked as handled, with the original 401 kept for debugging
        expect(error).toBeInstanceOf(SessionEndedError);
        expect(error).toMatchObject({ cause: { response: { status: 401 } } });
        expect(handler).toHaveBeenCalledOnce();
    });

    it('should reject with the 401 (unauthenticated) unchanged when the handler ended no session', async () =>
    {
        // Arrange: nobody logged in, as for restore()'s 401 at boot
        handler.mockReturnValue(false);
        respondWith(401);

        // Act
        const error: unknown = await getRequest('/probe').catch((rejection: unknown) => rejection);

        // Assert: a plain 401, so restore() and useForm treat it as unhandled
        expect(error).not.toBeInstanceOf(SessionEndedError);
        expect(error).toMatchObject({ response: { status: 401 } });
        expect(handler).toHaveBeenCalledOnce();
    });

    it('should reject without calling the unauthenticated handler when a request fails with a 500 (server error)', async () =>
    {
        // Arrange
        respondWith(500);

        // Act + Assert
        await expect(getRequest('/probe')).rejects.toMatchObject({ response: { status: 500 } });

        // Assert: only a 401 means the session ended
        expect(handler).not.toHaveBeenCalled();
    });
});

describe('checkResponse', () =>
{
    // A stand-in guard: checkResponse only needs some `value is X` to call.
    const isNumber = (value: unknown): value is number => typeof value === 'number';

    it('should return the body itself when the guard accepts it', () =>
    {
        // Act
        const result = checkResponse('/probe', 42, isNumber);

        // Assert
        expect(result).toBe(42);
    });

    it('should throw an UnexpectedResponseError naming the endpoint, without the body, when the guard rejects it', () =>
    {
        // Arrange: a body like a near-miss business, with data that must not travel with the error
        const body = { id: 1, kvk_number: '12345678' };

        // Act + Assert: a class, so callers can catch it with instanceof
        expect(() => checkResponse('/probe', body, isNumber)).toThrow(UnexpectedResponseError);

        // Assert: the message names only the endpoint
        expect(() => checkResponse('/probe', body, isNumber)).toThrow(expect.objectContaining({
            name: 'UnexpectedResponseError',
            message: 'Unexpected response from /probe',
        }));

        // Assert: no cause either, where the console and error reporters would find the body
        expect(() => checkResponse('/probe', body, isNumber)).toThrow(expect.not.objectContaining({ cause: expect.anything() }));
    });
});

describe('versionFrom', () =>
{
    // A real response through the real axios instance, so the header arrives
    // the way axios hands it over: name lowercased, value a string.
    const responseWithEtag = async (etag: string | null) =>
    {
        const headers: Record<string, string> = etag === null ? {} : { ETag: etag };
        server.use(route.get('/api/probe', () => HttpResponse.json({}, { headers })));

        return getRequest<unknown>('/probe');
    };

    it.each([
        ['"42"', 42],
        ['"0"', 0], // the regex's own branch: zero is the one number allowed to start with 0
    ])('should return the version an ETag of %s names', async (etag, expected) =>
    {
        // Arrange
        const response = await responseWithEtag(etag);

        // Act
        const version = versionFrom('/probe', response);

        // Assert
        expect(version).toBe(expected);
    });

    it.each([
        ['no ETag', null], // the backend forgot to send one
        ['a weak ETag', 'W/"42"'], // never names one exact version
        ['the wildcard', '*'], // means any version, the opposite of a check
        ['a leading zero', '"042"'], // compared byte for byte, so not the "42" the backend sent
        ['an unquoted version', '42'],
        ['a version past Number.MAX_SAFE_INTEGER', '"9007199254740993"'], // 2^53 + 1: Number() would round it to 2^53
    ])('should throw an UnexpectedResponseError naming the endpoint for %s', async (_case, etag) =>
    {
        // Arrange
        const response = await responseWithEtag(etag);

        // Act + Assert
        expect(() => versionFrom('/probe', response)).toThrow(expect.objectContaining({
            name: 'UnexpectedResponseError',
            message: 'Unexpected response from /probe',
        }));
    });
});

describe('If-Match', () =>
{
    // What the server received as If-Match, or null when the header wasn't sent.
    const recordIfMatch = (): { received: string | null | undefined } =>
    {
        const record: { received: string | null | undefined } = { received: undefined };
        const remember = ({ request }: { request: Request }) =>
        {
            record.received = request.headers.get('If-Match');

            return new HttpResponse(null, { status: 204 });
        };
        server.use(route.put('/api/probe', remember), route.delete('/api/probe', remember));

        return record;
    };

    it.each([
        ['putRequest', () => putRequest('/probe', {}, 7)],
        ['deleteRequest', () => deleteRequest('/probe', 7)],
    ])('should send version 7 as If-Match: "7" from %s', async (_name, send) =>
    {
        // Arrange
        const record = recordIfMatch();

        // Act
        await send();

        // Assert: quoted, a strong ETag, which is all the backend accepts
        expect(record.received).toBe('"7"');
    });

    it.each([
        ['putRequest', () => putRequest('/probe', {})],
        ['deleteRequest', () => deleteRequest('/probe')],
    ])('should send no If-Match from %s without a version', async (_name, send) =>
    {
        // Arrange
        const record = recordIfMatch();

        // Act
        await send();

        // Assert: null, not undefined, so the request did arrive; the header is simply absent, as for clients and bank accounts
        expect(record.received).toBeNull();
    });
});
