import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import * as auth from '@/services/auth';
import { useAuthStore } from '@/domains/auth/store';
import { endExpiredSession } from '@/domains/auth/handlers/endExpiredSession';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const user = { id: 1, name: 'Jan de Vries', email: 'jan@example.nl' };

describe('endExpiredSession', () =>
{
    // assign is a spy (and a stub: it does nothing). jsdom can't do a real page
    // load, and won't let vi.spyOn redefine location.assign, so the whole
    // location is swapped for a copy with a spy in its place.
    const assign = vi.fn<(url: string | URL) => void>();

    beforeEach(() =>
    {
        // A fresh Pinia per test, so no test starts with another's logged-in user.
        setActivePinia(createPinia());
        vi.resetAllMocks();
        vi.stubGlobal('location', { ...window.location, assign });
    });

    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it('should clear the store and do a full page load of /login when a user is logged in', async () =>
    {
        // Arrange: logged in through login(), since user is private to the store
        vi.mocked(auth.login).mockResolvedValue(user);
        const store = useAuthStore();
        await store.login({ email: 'jan@example.nl', password: 'secret-password' });

        // Act: what the http layer does on a 401
        endExpiredSession();

        // Assert
        expect(store.isLoggedIn).toBe(false);
        expect(assign).toHaveBeenCalledExactlyOnceWith('/login');
    });

    it('should not load /login when nobody is logged in', () =>
    {
        // Arrange: logged out, as during restore()'s boot-time 401
        const store = useAuthStore();

        // Act
        endExpiredSession();

        // Assert: restore() handles that 401 itself; a page load here would loop
        // the boot on /login
        expect(store.isLoggedIn).toBe(false);
        expect(assign).not.toHaveBeenCalled();
    });
});
