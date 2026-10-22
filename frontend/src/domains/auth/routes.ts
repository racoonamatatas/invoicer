import { AppRoute } from '@/router/AppRoute';

export const authRoutes: AppRoute[] = [
    new AppRoute('/login', 'login', () => import('./pages/Login.vue')).public(),
    new AppRoute('/register', 'register', () => import('./pages/Register.vue')).public(),
    new AppRoute('/verify-email', 'verifyEmail', () => import('./pages/VerifyEmail.vue')).public(),
    new AppRoute('/forgot-password', 'forgotPassword', () => import('./pages/ForgotPassword.vue')).public(),
    new AppRoute('/reset-password', 'resetPassword', () => import('./pages/ResetPassword.vue')).public(),
    // No .public(): only a logged-in user can change their password.
    new AppRoute('/change-password', 'changePassword', () => import('./pages/ChangePassword.vue')),
];
