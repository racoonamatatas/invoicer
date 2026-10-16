import type { RouteLocationNormalized } from 'vue-router';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';

import { authGuard } from '@/router/authGuard';

// The guard only reads meta, so the rest of the route location is left out.
const routeWith = (meta: RouteLocationNormalized['meta']) => ({ meta }) as RouteLocationNormalized;

describe('authGuard', () =>
{
    beforeEach(() =>
    {
        // A fresh Pinia per test: the real auth store, starting logged out.
        setActivePinia(createPinia());
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
});
