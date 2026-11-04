import type { InvoiceListItem } from '@/services/invoices';

// A domestic draft as the invoices list sends it. No number: a draft has none.
export const draftListItem = (id: number, clientId: number, totalCents: number): InvoiceListItem => ({
    id,
    status: 'draft',
    vat_treatment: 'domestic',
    number: null,
    client_id: clientId,
    bank_account_id: 5,
    payment_term_days: null,
    total_cents: totalCents,
});
