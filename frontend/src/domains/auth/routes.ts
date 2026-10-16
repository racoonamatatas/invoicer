import { AppRoute } from '@/router/AppRoute';

export const authRoutes: AppRoute[] = [
    new AppRoute('/login', 'login', () => import('./pages/Login.vue')).public(),
];
