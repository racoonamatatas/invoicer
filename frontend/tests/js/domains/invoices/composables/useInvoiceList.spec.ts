import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { defineComponent, ref } from 'vue';

import { useInvoiceList } from '@/domains/invoices/composables/useInvoiceList';
import { listClients } from '@/services/clients';
import { SessionEndedError } from '@/services/http';
import { listInvoices } from '@/services/invoices';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { dutchClient } from '../../../utility/clients';
import { createDeferred } from '../../../utility/createDeferred';
import { draftListItem } from '../../../utility/invoices';

vi.mock('@/services/clients', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/clients')>(),
    listClients: vi.fn<typeof listClients>(),
}));

vi.mock('@/services/invoices', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/invoices')>(),
    listInvoices: vi.fn<typeof listInvoices>(),
}));

// Unmounted after each test, so a host's watchers stop with it.
enableAutoUnmount(afterEach);

const acme = dutchClient(3, 'Acme');
const bolt = dutchClient(4, 'Bolt');

// A composable's watchers only run inside a component's setup, so a host
// component that renders nothing calls it, the way a page does. The business
// id is a ref, so a test can move to another business.
const mountInvoiceList = (initialBusinessId: number | null = 7) =>
{
    const businessId = ref<number | null>(initialBusinessId);
    const errorHandler = vi.fn<(error: unknown) => void>();

    let invoiceList: ReturnType<typeof useInvoiceList> | undefined;
    const Host = defineComponent({
        setup()
        {
            invoiceList = useInvoiceList(() => businessId.value);

            return () => null;
        },
    });
    mount(Host, { global: { config: { errorHandler } } });

    if (invoiceList === undefined)
    {
        throw new Error('Host did not run its setup');
    }

    return { ...invoiceList, businessId, errorHandler };
};

describe('useInvoiceList', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should be loaded with each invoice\'s client name and total when both lists get a 200 (ok)', async () =>
    {
        // Arrange
        vi.mocked(listInvoices).mockResolvedValue([draftListItem(11, 4, 3634), draftListItem(10, 3, 12100)]);
        vi.mocked(listClients).mockResolvedValue([acme, bolt]);

        // Act
        const { state } = mountInvoiceList();
        await flushPromises();

        // Assert: in the invoices' order, not the clients'
        expect(listInvoices).toHaveBeenCalledWith(7);
        expect(listClients).toHaveBeenCalledWith(7);
        expect(state.value).toEqual({
            kind: 'loaded',
            rows: [
                { invoice: draftListItem(11, 4, 3634), clientName: 'Bolt', total: 3634 },
                { invoice: draftListItem(10, 3, 12100), clientName: 'Acme', total: 12100 },
            ],
        });
    });

    it('should be failed, and hand the error to Vue, when an invoice names a client that isn\'t in the clients list', async () =>
    {
        // Arrange: the clients were read before client 4 and its invoice existed
        vi.mocked(listInvoices).mockResolvedValue([draftListItem(11, 4, 3634)]);
        vi.mocked(listClients).mockResolvedValue([acme]);

        // Act
        const { state, errorHandler } = mountInvoiceList();
        await flushPromises();

        // Assert
        expect(state.value).toEqual({ kind: 'failed' });
        expect(errorHandler).toHaveBeenCalledOnce();
    });

    it.each([
        ['the invoices', () => vi.mocked(listInvoices).mockRejectedValue(axiosErrorWith(500, {}))],
        ['the clients', () => vi.mocked(listClients).mockRejectedValue(axiosErrorWith(500, {}))],
    ])('should be failed when the request for %s gets a 500 (server error)', async (_list, failRequest) =>
    {
        // Arrange: both succeed, then one is made to fail
        vi.mocked(listInvoices).mockResolvedValue([]);
        vi.mocked(listClients).mockResolvedValue([]);
        failRequest();

        // Act
        const { state, errorHandler } = mountInvoiceList();
        await flushPromises();

        // Assert
        expect(state.value).toEqual({ kind: 'failed' });
        expect(errorHandler).toHaveBeenCalledOnce();
    });

    it('should stay loading, and not hand the error to Vue, when the session ended', async () =>
    {
        // Arrange: /login is already loading, so there is nothing to show
        vi.mocked(listInvoices).mockRejectedValue(new SessionEndedError(axiosErrorWith(401, {})));
        vi.mocked(listClients).mockResolvedValue([]);

        // Act
        const { state, errorHandler } = mountInvoiceList();
        await flushPromises();

        // Assert
        expect(state.value).toEqual({ kind: 'loading' });
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should be loaded after a reload that follows a failed load', async () =>
    {
        // Arrange
        vi.mocked(listInvoices).mockRejectedValueOnce(axiosErrorWith(500, {})).mockResolvedValue([draftListItem(10, 3, 12100)]);
        vi.mocked(listClients).mockResolvedValue([acme]);
        const { state, reload } = mountInvoiceList();
        await flushPromises();

        // Act
        await reload();

        // Assert
        expect(state.value).toEqual({
            kind: 'loaded',
            rows: [{ invoice: draftListItem(10, 3, 12100), clientName: 'Acme', total: 12100 }],
        });
    });

    it('should show the new business\'s invoices when the old business\'s answer arrives after them', async () =>
    {
        // Arrange: business 7's invoices are held in flight
        const held = createDeferred();
        vi.mocked(listInvoices).mockImplementation(async (id) =>
        {
            if (id === 7)
            {
                await held.promise;

                return [draftListItem(10, 3, 12100)];
            }

            return [draftListItem(20, 4, 3634)];
        });
        vi.mocked(listClients).mockResolvedValue([acme, bolt]);
        const { state, businessId } = mountInvoiceList();

        // Act: move to business 8, let it load, then let business 7 answer
        businessId.value = 8;
        await flushPromises();
        held.resolve();
        await flushPromises();

        // Assert
        expect(state.value).toEqual({
            kind: 'loaded',
            rows: [{ invoice: draftListItem(20, 4, 3634), clientName: 'Bolt', total: 3634 }],
        });
    });

    it('should keep the new business\'s invoices, and not hand the error to Vue, when the old business\'s request fails after them', async () =>
    {
        // Arrange: business 7's invoices are held in flight, then fail
        const held = createDeferred();
        vi.mocked(listInvoices).mockImplementation(async (id) =>
        {
            if (id === 7)
            {
                await held.promise;
                throw axiosErrorWith(500, {});
            }

            return [draftListItem(20, 4, 3634)];
        });
        vi.mocked(listClients).mockResolvedValue([acme, bolt]);
        const { state, businessId, errorHandler } = mountInvoiceList();

        // Act: move to business 8, let it load, then let business 7 fail
        businessId.value = 8;
        await flushPromises();
        held.resolve();
        await flushPromises();

        // Assert: the failure belongs to a business the page has left
        expect(state.value).toEqual({
            kind: 'loaded',
            rows: [{ invoice: draftListItem(20, 4, 3634), clientName: 'Bolt', total: 3634 }],
        });
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should make no request while there is no business to load for', async () =>
    {
        // Act: null while the business itself is still loading
        const { state } = mountInvoiceList(null);
        await flushPromises();

        // Assert
        expect(listInvoices).not.toHaveBeenCalled();
        expect(state.value).toEqual({ kind: 'loading' });
    });
});
