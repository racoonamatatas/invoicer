import { AppRoute } from '@/router/AppRoute';

export const businessesRoutes: AppRoute[] = [
    new AppRoute('/businesses', 'businesses', () => import('./pages/Businesses.vue')),
];
