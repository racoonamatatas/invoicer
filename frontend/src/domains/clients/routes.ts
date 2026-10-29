import { AppRoute } from '@/router/AppRoute';

export const clientsRoutes: AppRoute[] = [
    // Nested under the business, the same way the API nests its clients.
    new AppRoute('/businesses/:businessId/clients', 'clients', () => import('./pages/Clients.vue')),
];
