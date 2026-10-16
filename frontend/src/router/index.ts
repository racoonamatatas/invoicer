import { createRouter, createWebHistory } from 'vue-router';

import { authRoutes } from '@/domains/auth/routes';
import { dashboardRoutes } from '@/domains/dashboard/routes';

const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [ ...authRoutes, ...dashboardRoutes],
});

export default router;
