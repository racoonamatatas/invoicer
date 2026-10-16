import { AppRoute } from '@/router/AppRoute';

export const dashboardRoutes: AppRoute[] = [
    new AppRoute('/', 'dashboard', () => import('./pages/Dashboard.vue')),
];
