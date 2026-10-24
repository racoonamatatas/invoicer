import { http as route, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';

import { checkResponse, getRequest, SessionEndedError, setUnauthenticatedHandler, UnexpectedResponseError } from '@/services/http';

// msw answers the real axios instance's requests, so the interceptor runs
// exactly as in the app, and src/ exports nothing just for this test.
// 'error': a request with no handler below fails the test instead of trying
// the network.
const server = setupServer();

// A made-up endpoint: these tests are about the interceptor, not any route.
const respondWith = (status: number) =>
    server.use(route.get('/api/probe', () => HttpResponse.json({ message: 'Response' }, { status })));

describe('http', () =>
{
    // Returns whether it ended a session; each test sets the answer it needs.
    const handler = vi.fn<() => boolean>();

    beforeAll(() =>
    {
        server.listen({ onUnhandledRequest: 'error' });
    });

    beforeEach(() =>
    {
        vi.resetAllMocks();
        // One slot, so this replaces whatever an earlier test set.
        setUnauthenticatedHandler(handler);
    });

    afterEach(() =>
    {
        server.resetHandlers();
    });

    afterAll(() =>
    {
        server.close();
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

    it('should throw an UnexpectedResponseError naming the endpoint, with the body as cause, when the guard rejects it', () =>
    {
        // Arrange
        const body = { id: 1 };

        // Act + Assert: a class, so callers can catch it with instanceof
        expect(() => checkResponse('/probe', body, isNumber)).toThrow(UnexpectedResponseError);

        // Assert: the body is kept for debugging, but stays out of the message
        expect(() => checkResponse('/probe', body, isNumber)).toThrow(expect.objectContaining({
            name: 'UnexpectedResponseError',
            message: 'Unexpected response from /probe',
            cause: body,
        }));
    });
});
