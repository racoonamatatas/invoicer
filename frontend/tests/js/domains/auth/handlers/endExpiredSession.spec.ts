import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const user = { id: 1, name: 'Jan de Vries', email: 'jan@example.nl' };

describe('endExpiredSession', () =>
{
    // assign is a spy (and a stub: it does nothing). jsdom can't do a real page
    // load, and won't let vi.spyOn redefine location.assign, so the whole
    // location is swapped for a copy with a spy in its place.
    const assign = vi.fn<(url: string | URL) => void>();

    // Imported per test, not at the top: endExpiredSession keeps a module-level
    // flag once it has ended a session, so each test needs a fresh copy of the
    // module, as each page load gets. The store and the mocked auth service are
    // re-imported with it, so the test sets up the same copies the handler uses.
    let auth: typeof import('@/services/auth');
    let useAuthStore: typeof import('@/domains/auth/store').useAuthStore;
    let endExpiredSession: typeof import('@/domains/auth/handlers/endExpiredSession').endExpiredSession;

    beforeEach(async () =>
    {
        vi.resetModules();
        auth = await import('@/services/auth');
        ({ useAuthStore } = await import('@/domains/auth/store'));
        ({ endExpiredSession } = await import('@/domains/auth/handlers/endExpiredSession'));

        // A fresh Pinia per test, so no test starts with another's logged-in user.
        setActivePinia(createPinia());
        vi.resetAllMocks();
        vi.stubGlobal('location', { ...window.location, assign });
    });

    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it('should clear the store, do a full page load of /login and return true when a user is logged in', async () =>
    {
        // Arrange: logged in through login(), since user is private to the store
        vi.mocked(auth.login).mockResolvedValue(user);
        const store = useAuthStore();
        await store.login({ email: 'jan@example.nl', password: 'secret-password' });

        // Act: what the http layer does on a 401
        const ended = endExpiredSession();

        // Assert: true tells the http layer this 401 has been handled
        expect(ended).toBe(true);
        expect(store.isLoggedIn).toBe(false);
        expect(assign).toHaveBeenCalledExactlyOnceWith('/login');
    });

    it('should not load /login and return false when nobody is logged in', () =>
    {
        // Arrange: logged out, as during restore()'s boot-time 401
        const store = useAuthStore();

        // Act
        const ended = endExpiredSession();

        // Assert: false, so the http layer passes the 401 on unchanged
        expect(ended).toBe(false);

        // Assert: restore() handles that 401 itself; a page load here would loop
        // the boot on /login
        expect(store.isLoggedIn).toBe(false);
        expect(assign).not.toHaveBeenCalled();
    });

    it('should return true without loading /login again for a second 401 (unauthenticated) from the same expiry', async () =>
    {
        // Arrange: logged in, then the first 401 ends the session
        vi.mocked(auth.login).mockResolvedValue(user);
        const store = useAuthStore();
        await store.login({ email: 'jan@example.nl', password: 'secret-password' });
        endExpiredSession();

        // Act: another request that was in flight comes back 401 after clear()
        const ended = endExpiredSession();

        // Assert: handled too, so useForm swallows it instead of re-throwing on
        // a page that's unloading; and /login is loaded only once
        expect(ended).toBe(true);
        expect(assign).toHaveBeenCalledExactlyOnceWith('/login');
    });
});
