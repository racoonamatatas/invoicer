import { http as route, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';

import { getRequest, setUnauthenticatedHandler } from '@/services/http';

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
    const handler = vi.fn<() => void>();

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

    it('should call the unauthenticated handler and still reject when a request fails with a 401 (unauthenticated)', async () =>
    {
        // Arrange
        respondWith(401);

        // Act + Assert: still rejects, so the caller stops at its await
        await expect(getRequest('/probe')).rejects.toMatchObject({ response: { status: 401 } });

        // Assert
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
