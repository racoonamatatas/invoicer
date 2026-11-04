import { AppRoute } from '@/router/AppRoute';

export const invoicesRoutes: AppRoute[] = [
    // Nested under the business, the same way the API nests its invoices.
    new AppRoute('/businesses/:businessId/invoices', 'invoices', () => import('./pages/Invoices.vue')),
    new AppRoute('/businesses/:businessId/invoices/new', 'newInvoice', () => import('./pages/InvoiceEditor.vue')),
    new AppRoute('/businesses/:businessId/invoices/:invoiceId/edit', 'editInvoice', () => import('./pages/InvoiceEditor.vue')),
];
