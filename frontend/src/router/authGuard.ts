import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';

import { useAuthStore } from '@/domains/auth/store';

// Sends a logged-out visitor to the login page unless the route is public.
// `!== true` keeps it fail closed: a route without the flag is protected.
// Relies on main.ts running restore() before the router starts, so isLoggedIn
// is already known on the first navigation.
export const authGuard = (to: RouteLocationNormalized): RouteLocationRaw | true =>
{
    if (to.meta.public !== true && !useAuthStore().isLoggedIn)
    {
        return { name: 'login' };
    }

    return true;
};
