import { AppRoute } from '@/router/AppRoute';

export const authRoutes: AppRoute[] = [
    new AppRoute('/login', 'login', () => import('./pages/Login.vue')).public(),
    new AppRoute('/register', 'register', () => import('./pages/Register.vue')).public(),
    new AppRoute('/verify-email', 'verifyEmail', () => import('./pages/VerifyEmail.vue')).public(),
];
