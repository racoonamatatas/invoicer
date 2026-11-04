// Package imports
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

// Project imports
import { parseRouteId } from '@/router/parseRouteId';
import { SessionEndedError } from '@/services/http';
import { fetchInvoice, InvoiceNotFoundError, updateInvoice, type InvoicePayload, type VersionedInvoice } from '@/services/invoices';

// What the edit page knows about its draft. `found` carries the version beside
// the invoice: the next save hands it back as If-Match.
export type RouteInvoiceState =
    | { kind: 'loading' }
    | { kind: 'failed' }
    | { kind: 'notFound' }
    | ({ kind: 'found' } & VersionedInvoice);

// The draft in the URL, fetched by id. businessId is null while there is no
// business to load for; no request then. An unknown id and another business's
// invoice are the same 404, so both are not-found.
export const useRouteInvoice = (businessId: () => number | null) =>
{
    const route = useRoute();

    const invoiceId = computed(() => parseRouteId(route.params.invoiceId));

    const state = ref<RouteInvoiceState>({ kind: 'loading' });

    // Counts requests, so only the latest may write state: back/forward to
    // another draft while one loads must not show the old one under its URL.
    let latest = 0;

    // A SessionEndedError is swallowed (/login is already loading), and so is
    // an InvoiceNotFoundError, an answer the page shows. Anything else is
    // re-thrown for Vue's error handler.
    const load = async (business: number, invoice: number): Promise<void> =>
    {
        const request = ++latest;
        state.value = { kind: 'loading' };

        try
        {
            const found = await fetchInvoice(business, invoice);

            if (request === latest)
            {
                state.value = { kind: 'found', ...found };
            }
        }
        catch (error) // unknown: anything can be thrown
        {
            if (request !== latest || error instanceof SessionEndedError)
            {
                return;
            }

            if (error instanceof InvoiceNotFoundError)
            {
                state.value = { kind: 'notFound' };

                return;
            }

            state.value = { kind: 'failed' };
            throw error;
        }
    };

    const loadCurrent = (): Promise<void> | undefined =>
    {
        const business = businessId();
        const invoice = invoiceId.value;

        // ++latest drops whatever was in flight, so it can't overwrite this.
        ++latest;

        if (invoice === null)
        {
            state.value = { kind: 'notFound' };

            return undefined;
        }

        if (business === null)
        {
            state.value = { kind: 'loading' };

            return undefined;
        }

        return load(business, invoice);
    };

    // Two sources, not one getter returning an array, so a business replaced
    // by a same-id copy doesn't fetch the draft again and unmount the form.
    watch([businessId, invoiceId], loadCurrent, { immediate: true });

    // A draft the backend just stored, newer than anything a load in flight
    // can bring: that GET may have been read before the write, and storing
    // its older version would make the user's next save a 412 on their own
    // edit. So the write wins, and ++latest drops the GET. Only while the URL
    // still names this draft: on another draft's page, ++latest would cancel
    // that page's load and leave it loading for good.
    const show = (stored: VersionedInvoice): void =>
    {
        if (invoiceId.value !== stored.invoice.id)
        {
            return;
        }

        ++latest;
        state.value = { kind: 'found', ...stored };
    };

    // For "Try again", and for "Load the latest version" after a 412.
    const reload = (): Promise<void> => loadCurrent() ?? Promise.resolve();

    // Nothing is caught: a 422 must reach the form's useForm, and a 412 (an
    // InvoiceVersionConflictError) the form's conflict message. A 412 stores
    // nothing, so the state keeps the version it had.
    const save = async (payload: InvoicePayload): Promise<VersionedInvoice> =>
    {
        const business = businessId();

        // The page only renders its form for a found draft, so this is a bug.
        if (state.value.kind !== 'found' || business === null)
        {
            throw new Error('useRouteInvoice: save() called without a found invoice');
        }

        const stored = await updateInvoice(business, state.value.invoice.id, payload, state.value.version);
        show(stored);

        return stored;
    };

    return { invoiceId, state, reload, save };
};
