import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { useRouteInvoice } from '@/domains/invoices/composables/useRouteInvoice';
import { SessionEndedError } from '@/services/http';
import { fetchInvoice, InvoiceNotFoundError, updateInvoice, type InvoicePayload, type VersionedInvoice } from '@/services/invoices';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';
import { newDraft } from '../../../utility/invoices';

// Only the request functions become vi.fn()s, so no request leaves the test.
// InvoiceNotFoundError stays real: the composable tells it apart with
// instanceof.
vi.mock('@/services/invoices', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/invoices')>(),
    fetchInvoice: vi.fn<typeof fetchInvoice>(),
    updateInvoice: vi.fn<typeof updateInvoice>(),
}));

// Unmounted after each test, so a host's watchers stop with it.
enableAutoUnmount(afterEach);

// Draft 11 at the version a GET returns, and after a save stores version 4.
const loaded: VersionedInvoice = newDraft(11, 3, 5);
const saved: VersionedInvoice = { invoice: { ...loaded.invoice, payment_term_days: 30 }, version: 4 };
const other: VersionedInvoice = newDraft(12, 3, 5);

const payload: InvoicePayload = { client_id: 3, bank_account_id: 5, vat_treatment: 'domestic', payment_term_days: 30, lines: [] };

// A host component that renders nothing calls the composable, the way a page
// does: its watchers only run inside a component's setup. A router of its
// own with one route, so a test moves between drafts by pushing paths.
const mountRouteInvoice = async (path: string, errorHandler?: (error: unknown) => void) =>
{
    const business = ref<{ id: number } | null>({ id: 7 });

    let routeInvoice: ReturnType<typeof useRouteInvoice> | undefined;
    const Host = defineComponent({
        setup()
        {
            routeInvoice = useRouteInvoice(() => business.value?.id ?? null);

            return () => null;
        },
    });

    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/businesses/:businessId/invoices/:invoiceId/edit', component: Host }],
    });
    await router.push(path);
    mount(Host, { global: { plugins: [router], config: { errorHandler } } });

    if (routeInvoice === undefined)
    {
        throw new Error('Host did not run its setup');
    }

    return { ...routeInvoice, router, business };
};

describe('useRouteInvoice', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should be found with the draft and its version when fetchInvoice gets a 200 (ok)', async () =>
    {
        // Arrange
        vi.mocked(fetchInvoice).mockResolvedValue(loaded);

        // Act
        const { state } = await mountRouteInvoice('/businesses/7/invoices/11/edit');
        await flushPromises();

        // Assert
        expect(fetchInvoice).toHaveBeenCalledExactlyOnceWith(7, 11);
        expect(state.value).toStrictEqual({ kind: 'found', ...loaded });
    });

    it('should be not found, and hand nothing on, when fetchInvoice gets a 404 (not found)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        vi.mocked(fetchInvoice).mockRejectedValue(new InvoiceNotFoundError(axiosErrorWith(404, { message: 'Not Found' })));
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { state } = await mountRouteInvoice('/businesses/7/invoices/11/edit', errorHandler);
        await flushPromises();

        // Assert: an answer the page shows, not a fault to log
        expect(state.value).toStrictEqual({ kind: 'notFound' });
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should be failed and hand the error on when fetchInvoice fails with a 500 (server error), then found when reload gets a 200 (ok)', async () =>
    {
        // Arrange
        const serverError = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(fetchInvoice).mockRejectedValueOnce(serverError).mockResolvedValueOnce(loaded);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { state, reload } = await mountRouteInvoice('/businesses/7/invoices/11/edit', errorHandler);
        await flushPromises();
        expect(state.value).toStrictEqual({ kind: 'failed' });
        expect(errorHandler).toHaveBeenCalledOnce();

        // Act
        await reload();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'found', ...loaded });
    });

    it('should stay loading and hand nothing on when fetchInvoice ends the session with a 401 (unauthenticated)', async () =>
    {
        // Arrange
        vi.mocked(fetchInvoice).mockRejectedValue(new SessionEndedError(axiosErrorWith(401, { message: 'Unauthenticated.' })));
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { state } = await mountRouteInvoice('/businesses/7/invoices/11/edit', errorHandler);
        await flushPromises();

        // Assert: /login is already loading, so there is nothing to show
        expect(state.value).toStrictEqual({ kind: 'loading' });
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it.for<[name: string, invoiceId: string]>([
        ['letters', 'abc'],
        ['leading zero', '011'],
        ['exponent', '1e3'],
    ])('should be not found without asking the backend when the invoice id can\'t be an id: %s', async ([_name, invoiceId]) =>
    {
        // Act
        const { state } = await mountRouteInvoice(`/businesses/7/invoices/${invoiceId}/edit`);
        await flushPromises();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'notFound' });
        expect(fetchInvoice).not.toHaveBeenCalled();
    });

    it('should send no request while there is no business id, and load as soon as there is one', async () =>
    {
        // Arrange: the page's business is still loading
        vi.mocked(fetchInvoice).mockResolvedValue(loaded);
        const { state, business } = await mountRouteInvoice('/businesses/7/invoices/11/edit');
        business.value = null;
        await flushPromises();
        vi.mocked(fetchInvoice).mockClear(); // the mount's own load, before the id went null

        // Assert
        expect(state.value).toStrictEqual({ kind: 'loading' });
        expect(fetchInvoice).not.toHaveBeenCalled();

        // Act
        business.value = { id: 7 };
        await flushPromises();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'found', ...loaded });
    });

    it('should show only the draft in the URL when the response for the draft left behind arrives last', async () =>
    {
        // Arrange: draft 11's GET is held until after draft 12's answered
        const elevenRequest = createDeferred();
        vi.mocked(fetchInvoice).mockImplementation(async (_businessId, invoiceId): Promise<VersionedInvoice> =>
        {
            if (invoiceId === 11)
            {
                await elevenRequest.promise;

                return loaded;
            }

            return other;
        });
        const { state, router } = await mountRouteInvoice('/businesses/7/invoices/11/edit');

        // Act
        await router.push('/businesses/7/invoices/12/edit');
        await flushPromises();
        elevenRequest.resolve();
        await flushPromises();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'found', ...other });
    });

    it('should send the shown version as If-Match, and keep the saved version when a load that read the draft before the save answers after it', async () =>
    {
        // Arrange: the second GET is held, so it answers after the PUT
        const staleRequest = createDeferred();
        vi.mocked(fetchInvoice)
            .mockResolvedValueOnce(loaded)
            .mockImplementationOnce(async (): Promise<VersionedInvoice> =>
            {
                await staleRequest.promise;

                return loaded; // read before the PUT committed: still version 1
            });
        vi.mocked(updateInvoice).mockResolvedValue(saved);
        const { state, reload, save } = await mountRouteInvoice('/businesses/7/invoices/11/edit');
        await flushPromises();

        // Act: the save is sent while the draft is shown, then a load starts
        // before it answers
        const saving = save(payload);
        void reload();
        await saving;
        staleRequest.resolve();
        await flushPromises();

        // Assert
        expect(updateInvoice).toHaveBeenCalledExactlyOnceWith(7, 11, payload, 1);
        expect(state.value).toStrictEqual({ kind: 'found', ...saved });
    });

    it('should leave another draft\'s load alone when a save of the draft left behind answers', async () =>
    {
        // Arrange: draft 12's GET is held while draft 11's save answers
        const twelveRequest = createDeferred();
        vi.mocked(fetchInvoice).mockImplementation(async (_businessId, invoiceId): Promise<VersionedInvoice> =>
        {
            if (invoiceId === 12)
            {
                await twelveRequest.promise;

                return other;
            }

            return loaded;
        });
        const saveRequest = createDeferred();
        vi.mocked(updateInvoice).mockImplementation(async (): Promise<VersionedInvoice> =>
        {
            await saveRequest.promise;

            return saved;
        });
        const { state, router, save } = await mountRouteInvoice('/businesses/7/invoices/11/edit');
        await flushPromises();

        // Act
        const saving = save(payload);
        await router.push('/businesses/7/invoices/12/edit');
        saveRequest.resolve();
        await saving;
        twelveRequest.resolve();
        await flushPromises();

        // Assert: draft 12 isn't stuck loading, and draft 11 isn't shown
        // under 12's URL
        expect(state.value).toStrictEqual({ kind: 'found', ...other });
    });

    it('should show an adopted draft without a request when the URL comes to name it', async () =>
    {
        // Arrange: the page that created draft 12 hands it over first
        vi.mocked(fetchInvoice).mockResolvedValue(loaded);
        const { state, router, adopt } = await mountRouteInvoice('/businesses/7/invoices/11/edit');
        await flushPromises();
        vi.mocked(fetchInvoice).mockClear();

        // Act
        adopt(other);
        await router.push('/businesses/7/invoices/12/edit');
        await flushPromises();

        // Assert
        expect(fetchInvoice).not.toHaveBeenCalled();
        expect(state.value).toStrictEqual({ kind: 'found', ...other });
    });
    it('should drop an adopted draft once the URL names another, so a later visit fetches it', async () =>
    {
        // Arrange
        vi.mocked(fetchInvoice).mockResolvedValue(loaded);
        const { router, adopt } = await mountRouteInvoice('/businesses/7/invoices/11/edit');
        await flushPromises();
        adopt(other);

        // Act: the URL moves to draft 12 only after naming draft 10
        await router.push('/businesses/7/invoices/10/edit');
        await flushPromises();
        vi.mocked(fetchInvoice).mockClear();
        await router.push('/businesses/7/invoices/12/edit');
        await flushPromises();

        // Assert: draft 12 is fetched, not shown with its creation-time version
        expect(fetchInvoice).toHaveBeenCalledExactlyOnceWith(7, 12);
    });
});
