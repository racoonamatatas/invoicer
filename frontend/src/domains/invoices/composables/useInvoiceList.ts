// Package imports
import { ref, watch } from 'vue';

// Project imports
import type { Cents } from '@/form/amounts';
import { listClients } from '@/services/clients';
import { SessionEndedError } from '@/services/http';
import { listInvoices, type InvoiceListItem } from '@/services/invoices';

// One row of the invoices page: the invoice, its client's name and its total.
export interface InvoiceRow
{
    invoice: InvoiceListItem;
    clientName: string;
    total: Cents;
}

// What the invoices page knows about one business's invoices. A union, so the
// page can't show a list while it also thinks the load failed.
export type InvoiceListState =
    | { kind: 'loading' }
    | { kind: 'failed' }
    | { kind: 'loaded'; rows: readonly InvoiceRow[] };

// An invoice only carries its client's id, so the rows are built against the
// business's clients. A client can't be deleted while an invoice uses it, so
// a missing one means the two lists were read at different moments, e.g. a
// client and its first invoice created in another tab between the requests.
// A throw, not a blank name: the load fails, and Try again reads both anew.
const rowsFrom = (invoices: readonly InvoiceListItem[], clientNames: ReadonlyMap<number, string>): InvoiceRow[] =>
{
    return invoices.map((invoice) =>
    {
        const clientName = clientNames.get(invoice.client_id);
        if (clientName === undefined)
        {
            throw new Error(`Invoice ${invoice.id} names client ${invoice.client_id}, which is not in the business's clients.`);
        }

        // The guard has proven an integer. A negative total would be a backend
        // bug, and formatCents() throws on it rather than show a wrong amount.
        return { invoice, clientName, total: invoice.total_cents as Cents };
    });
};

// The invoices of the business in businessId, loaded with the page. Not a
// store: only this page shows them. businessId is null while there is no
// business to load for (still loading, or not found); no request then.
export const useInvoiceList = (businessId: () => number | null) =>
{
    const state = ref<InvoiceListState>({ kind: 'loading' });

    // Counts requests, so only the latest may write state. Back/forward to
    // another business while a list is in flight would otherwise let the old
    // business's invoices land under the new one's URL.
    let latest = 0;

    // The page shows a failure and offers reload(), and the error is re-thrown
    // so Vue's error handler still sees it. A SessionEndedError is swallowed:
    // /login is already loading.
    const load = async (id: number): Promise<void> =>
    {
        const request = ++latest;

        // Only a retry after a failure shows Loading... again; a reload keeps
        // the list on screen until the new one arrives.
        if (state.value.kind === 'failed')
        {
            state.value = { kind: 'loading' };
        }

        try
        {
            // In parallel: neither request needs the other's answer. If either
            // fails, the whole load fails, as a row needs both.
            const [invoices, clients] = await Promise.all([listInvoices(id), listClients(id)]);

            if (request === latest)
            {
                state.value = { kind: 'loaded', rows: rowsFrom(invoices, new Map(clients.map((client) => [client.id, client.name]))) };
            }
        }
        catch (error) // unknown: anything can be thrown
        {
            // A stale failure belongs to a business the page has left.
            if (request !== latest || error instanceof SessionEndedError)
            {
                return;
            }

            state.value = { kind: 'failed' };
            throw error;
        }
    };

    // A watcher, not a bare call in setup: Vue hands a rejected watch callback
    // to its error handler. Another business starts from Loading..., and
    // ++latest drops whatever was in flight for the old one.
    watch(businessId, (id) =>
    {
        ++latest;
        state.value = { kind: 'loading' };

        return id === null ? undefined : load(id);
    }, { immediate: true });

    // For the page's "Try again".
    const reload = (): Promise<void> =>
    {
        const id = businessId();

        return id === null ? Promise.resolve() : load(id);
    };

    return { state, reload };
};
