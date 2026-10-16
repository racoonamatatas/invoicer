import { AxiosError } from 'axios';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import * as auth from '@/services/auth';
import { useAuthStore } from '@/domains/auth/store';
import { axiosErrorWith } from '../../utility/axiosErrorWith';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const user = { id: 1, name: 'Jan de Vries', email: 'jan@example.nl' };

describe('auth store', () =>
{
    beforeEach(() =>
    {
        // A fresh Pinia per test, so no test starts with another's logged-in user.
        setActivePinia(createPinia());
        vi.resetAllMocks();
    });

    it('should start with no user and isLoggedIn false', () =>
    {
        // Act
        const store = useAuthStore();

        // Assert: nobody is logged in until login() or restore() says so
        expect(store.user).toBeNull();
        expect(store.isLoggedIn).toBe(false);
    });

    it('should fill user and set isLoggedIn when login gets a 200 (ok)', async () =>
    {
        // Arrange: auth.login is a stub (canned user) and a spy (records its call)
        const credentials = { email: 'jan@example.nl', password: 'secret-password' };
        vi.mocked(auth.login).mockResolvedValue(user);
        const store = useAuthStore();

        // Act
        await store.login(credentials);

        // Assert: the spy got the page's credentials, and the store holds the stub's user
        expect(auth.login).toHaveBeenCalledExactlyOnceWith(credentials);
        expect(store.user).toStrictEqual(user);
        expect(store.isLoggedIn).toBe(true);
    });

    it('should clear user and isLoggedIn when logout gets a 204 (no content)', async () =>
    {
        // Arrange: logged in through login(), since user is private to the store
        vi.mocked(auth.login).mockResolvedValue(user);
        vi.mocked(auth.logout).mockResolvedValue();
        const store = useAuthStore();
        await store.login({ email: 'jan@example.nl', password: 'secret-password' });

        // Act
        await store.logout();

        // Assert: the backend was asked once, and the store no longer holds a user
        expect(auth.logout).toHaveBeenCalledOnce();
        expect(store.user).toBeNull();
        expect(store.isLoggedIn).toBe(false);
    });

    it('should keep user and isLoggedIn when logout fails with a 500 (server error)', async () =>
    {
        // Arrange: logged in, and the backend fails the logout, so the session still exists
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(auth.login).mockResolvedValue(user);
        vi.mocked(auth.logout).mockRejectedValue(error);
        const store = useAuthStore();
        await store.login({ email: 'jan@example.nl', password: 'secret-password' });

        // Act + Assert: the page gets the original error to handle
        await expect(store.logout()).rejects.toBe(error);

        // Assert: the frontend still matches the backend, where the user is logged in
        expect(store.user).toStrictEqual(user);
        expect(store.isLoggedIn).toBe(true);
    });

    it('should fill user and set isLoggedIn when restore gets a 200 (ok)', async () =>
    {
        // Arrange: auth.fetchUser is a stub (canned user) and a spy (records its call)
        vi.mocked(auth.fetchUser).mockResolvedValue(user);
        const store = useAuthStore();

        // Act: what the app does on page load, when the session cookie is still valid
        await store.restore();

        // Assert: the backend was asked once, and the store holds its user
        expect(auth.fetchUser).toHaveBeenCalledOnce();
        expect(store.user).toStrictEqual(user);
        expect(store.isLoggedIn).toBe(true);
    });

    it('should clear user without throwing when restore gets a 401 (unauthenticated)', async () =>
    {
        // Arrange: logged in, then the session expired on the backend
        vi.mocked(auth.login).mockResolvedValue(user);
        vi.mocked(auth.fetchUser).mockRejectedValue(axiosErrorWith(401, { message: 'Unauthenticated.' }));
        const store = useAuthStore();
        await store.login({ email: 'jan@example.nl', password: 'secret-password' });

        // Act + Assert: a 401 is an answer ("nobody"), not a failure, so nothing reaches the page
        await expect(store.restore()).resolves.toBeUndefined();

        // Assert
        expect(store.user).toBeNull();
        expect(store.isLoggedIn).toBe(false);
    });

    // Every axios error except a 401: the server answered (or didn't) without
    // saying the session is gone. The network error has no response at all.
    it.for([
        { name: 'a 403 (forbidden)', error: axiosErrorWith(403, { message: 'Forbidden' }) },
        { name: 'a 419 (page expired)', error: axiosErrorWith(419, { message: 'Page Expired' }) },
        { name: 'a 500 (server error)', error: axiosErrorWith(500, { message: 'Server Error' }) },
        { name: 'a 503 (service unavailable)', error: axiosErrorWith(503, { message: 'Service Unavailable' }) },
        { name: 'a network error (no response)', error: new AxiosError('Network Error', AxiosError.ERR_NETWORK) },
    ])('should re-throw and keep user when restore fails with an error that is not a 401 (unauthenticated): $name', async ({ error }) =>
    {
        // Arrange: logged in, then fetching the user fails
        vi.mocked(auth.login).mockResolvedValue(user);
        vi.mocked(auth.fetchUser).mockRejectedValue(error);
        const store = useAuthStore();
        await store.login({ email: 'jan@example.nl', password: 'secret-password' });

        // Act + Assert: the page gets the original error to handle
        await expect(store.restore()).rejects.toBe(error);

        // Assert: the user is not logged out by a failure that isn't about the session
        expect(store.user).toStrictEqual(user);
        expect(store.isLoggedIn).toBe(true);
    });

    it('should re-throw and keep user when restore fails with a 401 (unauthenticated) that is not an AxiosError', async () =>
    {
        // Arrange: logged in, then fetchUser fails. Note: the error has status 401
        // but is not an AxiosError; only the isAxiosError check tells them apart
        const error = { response: { status: 401 } };
        vi.mocked(auth.login).mockResolvedValue(user);
        vi.mocked(auth.fetchUser).mockRejectedValue(error);
        const store = useAuthStore();
        await store.login({ email: 'jan@example.nl', password: 'secret-password' });

        // Act + Assert: the page gets the original error to handle
        await expect(store.restore()).rejects.toBe(error);

        // Assert: a 401 that didn't come from axios is not proof that the session is gone
        expect(store.user).toStrictEqual(user);
        expect(store.isLoggedIn).toBe(true);
    });
});
