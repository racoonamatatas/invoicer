import type { RouteLocationNormalized } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import { useAuthStore } from '@/domains/auth/store';
import { authGuard } from '@/router/authGuard';
import * as auth from '@/services/auth';

// Every export of the auth service becomes a vi.fn(), so logging in sends no request.
vi.mock('@/services/auth');

// The guard only reads meta, so the rest of the route location is left out.
const routeWith = (meta: RouteLocationNormalized['meta']) => ({ meta }) as RouteLocationNormalized;

describe('authGuard', () =>
{
    beforeEach(() =>
    {
        // A fresh Pinia per test: the real auth store, starting logged out.
        setActivePinia(createPinia());
        vi.resetAllMocks();
    });

    it.for([
        { name: 'public is false', meta: { public: false } },
        // Fail closed: a route that never set the flag is protected too.
        { name: 'no public flag', meta: {} },
    ])('should redirect to login when a logged-out visitor opens a protected route: $name', ({ meta }) =>
    {
        // Act
        const result = authGuard(routeWith(meta));

        // Assert
        expect(result).toStrictEqual({ name: 'login' });
    });

    it('should let a logged-in visitor open a protected route', async () =>
    {
        // Arrange: logged in through the real store; auth.login is a stub (canned user)
        vi.mocked(auth.login).mockResolvedValue({ id: 1, name: 'Jan de Vries', email: 'jan@example.nl' });
        await useAuthStore().login({ email: 'jan@example.nl', password: 'secret-password' });

        // Act
        const result = authGuard(routeWith({ public: false }));

        // Assert
        expect(result).toBe(true);
    });
});
