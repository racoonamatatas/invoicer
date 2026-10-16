import { createRouter, createWebHistory } from 'vue-router';

import { authRoutes } from '@/domains/auth/routes';
import { dashboardRoutes } from '@/domains/dashboard/routes';
import { authGuard } from '@/router/authGuard';

// Adds invoicer's own flags to every route's meta, so they are type-checked.
declare module 'vue-router'
{
    interface RouteMeta
    {
        // A logged-out visitor may open this route. Set by AppRoute.public();
        // absent counts as protected, see authGuard.
        public?: boolean;
    }
}

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [...authRoutes, ...dashboardRoutes].map((route) => route.toRecord()),
});

// Guards run in the order they are registered here.
router.beforeEach(authGuard);

export default router;
