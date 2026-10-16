import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import * as auth from '@/services/auth';
import { useAuthStore } from '@/stores/auth';

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
});
