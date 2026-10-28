import { AppRoute } from '@/router/AppRoute';

export const businessesRoutes: AppRoute[] = [
    // Where login and every "back" link go: the landing page only decides
    // which page comes next, so that rule lives in one place.
    new AppRoute('/', 'home', () => import('./pages/Landing.vue')),
    new AppRoute('/businesses', 'businesses', () => import('./pages/Businesses.vue')),
    // The business is in the URL, the same way the API nests under it, so a
    // refresh, a bookmark or a second tab always shows the same business.
    new AppRoute('/businesses/:businessId', 'dashboard', () => import('./pages/Dashboard.vue')),
    new AppRoute('/businesses/:businessId/settings', 'businessSettings', () => import('./pages/BusinessSettings.vue')),
];
