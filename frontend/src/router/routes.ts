import type { AppRoute } from '@/router/AppRoute';

import { authRoutes } from '@/domains/auth/routes';
import { businessesRoutes } from '@/domains/businesses/routes';
import { dashboardRoutes } from '@/domains/dashboard/routes';

// Every route in the app. Its own file, not part of router/index.ts, so tests
// can build a router from the same list without the browser history that file
// creates: a test router with a hand-picked subset can't resolve a link to a
// route it left out.
export const appRoutes: AppRoute[] = [...authRoutes, ...businessesRoutes, ...dashboardRoutes];
