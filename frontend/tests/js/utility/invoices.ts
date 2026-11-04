import type { InvoiceListItem, VersionedInvoice } from '@/services/invoices';

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

// A new domestic draft with no lines, as createInvoice resolves it: version 1,
// the first one a POST stores.
export const newDraft = (id: number, clientId: number, bankAccountId: number): VersionedInvoice => ({
    invoice: {
        id,
        status: 'draft',
        vat_treatment: 'domestic',
        number: null,
        client_id: clientId,
        bank_account_id: bankAccountId,
        payment_term_days: null,
        lines: [],
        totals: { subtotal_cents: 0, vat_groups: [], vat_cents: 0, total_cents: 0 },
    },
    version: 1,
});
