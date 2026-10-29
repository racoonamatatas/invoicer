import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { useRouteClient } from '@/domains/clients/composables/useRouteClient';
import { ClientNotFoundError, fetchClient, updateClient, type Client, type ClientPayload } from '@/services/clients';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { dutchClient } from '../../../utility/clients';
import { createDeferred } from '../../../utility/createDeferred';

// Only the request functions become vi.fn()s, so no request leaves the test.
// ClientNotFoundError stays real: the composable tells it apart with
// instanceof.
vi.mock('@/services/clients', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/clients')>(),
    fetchClient: vi.fn<typeof fetchClient>(),
    updateClient: vi.fn<typeof updateClient>(),
}));

// Unmounted after each test, so a host's watchers stop with it.
enableAutoUnmount(afterEach);

const acme = dutchClient(3, 'Acme');
const bolt = dutchClient(4, 'Bolt');

// Acme renamed: what the form sends, and what the backend stores from it.
const renamed: Client = { ...acme, name: 'Acme Groningen' };
const { id: _id, ...renamedPayload }: { id: number } & ClientPayload = renamed;

// A composable's watchers only run inside a component's setup, so a host
// component that renders nothing calls it, the way a page does. A router of
// its own with one route: the composable only reads :clientId, and the test
// moves between ids by pushing paths. The business is an object the id is
// read from, the way the page reads it from useRouteBusiness's state, so a
// test can replace it with a same-id copy.
const mountRouteClient = async (path: string, errorHandler?: (error: unknown) => void) =>
{
    const business = ref<{ id: number } | null>({ id: 7 });

    let routeClient: ReturnType<typeof useRouteClient> | undefined;
    const Host = defineComponent({
        setup()
        {
            routeClient = useRouteClient(() => business.value?.id ?? null);

            return () => null;
        },
    });

    const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: '/businesses/:businessId/clients/:clientId', component: Host }],
    });
    await router.push(path);
    mount(Host, { global: { plugins: [router], config: { errorHandler } } });

    if (routeClient === undefined)
    {
        throw new Error('Host did not run its setup');
    }

    return { ...routeClient, router, business };
};

describe('useRouteClient', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should be found with the client when fetchClient gets a 200 (ok) for the business and client in the URL', async () =>
    {
        // Arrange
        vi.mocked(fetchClient).mockResolvedValue(acme);

        // Act
        const { state } = await mountRouteClient('/businesses/7/clients/3');
        await flushPromises();

        // Assert
        expect(fetchClient).toHaveBeenCalledExactlyOnceWith(7, 3);
        expect(state.value).toStrictEqual({ kind: 'found', client: acme });
    });

    it('should be not found, and hand nothing on, when fetchClient gets a 404 (not found)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        vi.mocked(fetchClient).mockRejectedValue(new ClientNotFoundError(axiosErrorWith(404, { message: 'Not Found' })));
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { state } = await mountRouteClient('/businesses/7/clients/3', errorHandler);
        await flushPromises();

        // Assert: an answer the page shows, not a fault to log
        expect(state.value).toStrictEqual({ kind: 'notFound' });
        expect(errorHandler).not.toHaveBeenCalled();
    });

    // One row per kind of id that can't be a client id
    it.for([
        { name: 'letters', clientId: 'abc' },
        { name: 'leading zero', clientId: '03' },
        { name: 'exponent', clientId: '1e3' },
    ])('should be not found without asking the backend when the client id can\'t be an id: $name', async ({ clientId }) =>
    {
        // Act
        const { state } = await mountRouteClient(`/businesses/7/clients/${clientId}`);
        await flushPromises();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'notFound' });
        expect(fetchClient).not.toHaveBeenCalled();
    });

    it('should send no request while there is no business id, and load as soon as there is one', async () =>
    {
        // Arrange: the page's business is still loading
        vi.mocked(fetchClient).mockResolvedValue(acme);
        const { state, business } = await mountRouteClient('/businesses/7/clients/3');
        business.value = null;
        await flushPromises();
        vi.mocked(fetchClient).mockClear(); // the mount's own load, before the id went null

        // Assert
        expect(state.value).toStrictEqual({ kind: 'loading' });
        expect(fetchClient).not.toHaveBeenCalled();

        // Act
        business.value = { id: 7 };
        await flushPromises();

        // Assert
        expect(fetchClient).toHaveBeenCalledExactlyOnceWith(7, 3);
        expect(state.value).toStrictEqual({ kind: 'found', client: acme });
    });

    it('should be failed and hand the error on when fetchClient fails with a 500 (server error), then found when retry gets a 200 (ok)', async () =>
    {
        // Arrange
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(fetchClient)
            .mockRejectedValueOnce(error)
            .mockResolvedValueOnce(acme);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { state, retry } = await mountRouteClient('/businesses/7/clients/3', errorHandler);
        await flushPromises();

        // Assert: the error reached Vue's handler as it was
        expect(state.value).toStrictEqual({ kind: 'failed' });
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Act
        await retry();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'found', client: acme });
    });

    it('should show only the client in the URL when the response for the client left behind arrives last', async () =>
    {
        // Arrange: each client's request is finished by hand, in reverse order
        const acmeRequest = createDeferred();
        const boltRequest = createDeferred();
        vi.mocked(fetchClient).mockImplementation(async (_businessId, clientId): Promise<Client> =>
        {
            if (clientId === acme.id)
            {
                await acmeRequest.promise;

                return acme;
            }

            await boltRequest.promise;

            return bolt;
        });
        const { state, router } = await mountRouteClient('/businesses/7/clients/3');

        // Act: back/forward to another client while the first is in flight
        await router.push('/businesses/7/clients/4');
        boltRequest.resolve();
        await flushPromises();
        acmeRequest.resolve();
        await flushPromises();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'found', client: bolt });
    });

    it('should keep the client in the URL and hand nothing on when the request for the client left behind fails with a 500 (server error) after it', async () =>
    {
        // Arrange: Acme's request is held, then fails after Bolt is shown
        const acmeRequest = createDeferred();
        vi.mocked(fetchClient).mockImplementation(async (_businessId, clientId): Promise<Client> =>
        {
            if (clientId === acme.id)
            {
                await acmeRequest.promise;
                throw axiosErrorWith(500, { message: 'Server Error' });
            }

            return bolt;
        });
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { state, router } = await mountRouteClient('/businesses/7/clients/3', errorHandler);

        // Act
        await router.push('/businesses/7/clients/4');
        await flushPromises();
        acmeRequest.resolve();
        await flushPromises();

        // Assert: a failure for a page the user left is no failure of this one
        expect(state.value).toStrictEqual({ kind: 'found', client: bolt });
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should not fetch the client again when the business is replaced by a copy with the same id', async () =>
    {
        // Arrange
        vi.mocked(fetchClient).mockResolvedValue(acme);
        const { state, business } = await mountRouteClient('/businesses/7/clients/3');
        await flushPromises();
        vi.mocked(fetchClient).mockClear(); // the mount's own load

        // Act: what a reload of the businesses list does to the page's state
        business.value = { id: 7 };
        await flushPromises();

        // Assert: a refetch would have passed through loading and unmounted
        // the page's form, losing what was typed
        expect(fetchClient).not.toHaveBeenCalled();
        expect(state.value).toStrictEqual({ kind: 'found', client: acme });
    });

    it('should put the payload for the client shown, then show and return what the backend stored, when updateClient gets a 200 (ok)', async () =>
    {
        // Arrange
        vi.mocked(fetchClient).mockResolvedValue(acme);
        vi.mocked(updateClient).mockResolvedValue(renamed);
        const { state, save } = await mountRouteClient('/businesses/7/clients/3');
        await flushPromises();

        // Act
        const result = await save(renamedPayload);

        // Assert
        expect(updateClient).toHaveBeenCalledExactlyOnceWith(7, 3, renamedPayload);
        expect(result).toStrictEqual(renamed);
        expect(state.value).toStrictEqual({ kind: 'found', client: renamed });
    });

    it('should rethrow a 422 (unprocessable content) from updateClient unchanged and keep the client it had', async () =>
    {
        // Arrange
        const error = axiosErrorWith(422, { message: 'The email field must be a valid email address.' });
        vi.mocked(fetchClient).mockResolvedValue(acme);
        vi.mocked(updateClient).mockRejectedValue(error);
        const { state, save } = await mountRouteClient('/businesses/7/clients/3');
        await flushPromises();

        // Act + Assert: toBe, so the very error the form's useForm reads
        await expect(save(renamedPayload)).rejects.toBe(error);
        expect(state.value).toStrictEqual({ kind: 'found', client: acme });
    });

    it('should leave the client in the URL shown when a save for the client left behind arrives after navigating away', async () =>
    {
        // Arrange: the save is finished by hand, after the move to Bolt
        const saveRequest = createDeferred();
        vi.mocked(fetchClient).mockImplementation(async (_businessId, clientId): Promise<Client> => (clientId === acme.id ? acme : bolt));
        vi.mocked(updateClient).mockReturnValue(saveRequest.promise.then(() => renamed));
        const { state, save, router } = await mountRouteClient('/businesses/7/clients/3');
        await flushPromises();
        const saving = save(renamedPayload);

        // Act
        await router.push('/businesses/7/clients/4');
        await flushPromises();
        saveRequest.resolve();

        // Assert: the form still gets its answer, but Bolt's page keeps Bolt
        await expect(saving).resolves.toStrictEqual(renamed);
        expect(state.value).toStrictEqual({ kind: 'found', client: bolt });
    });

    it('should show what the backend stored when the save lands after navigating away and back to the same client', async () =>
    {
        // Arrange: the save is finished by hand, after the visit to Bolt and back
        const saveRequest = createDeferred();
        vi.mocked(fetchClient).mockImplementation(async (_businessId, clientId): Promise<Client> => (clientId === acme.id ? acme : bolt));
        vi.mocked(updateClient).mockReturnValue(saveRequest.promise.then(() => renamed));
        const { state, save, router } = await mountRouteClient('/businesses/7/clients/3');
        await flushPromises();
        const saving = save(renamedPayload);

        // Act: Acme's page again, loaded before the save lands
        await router.push('/businesses/7/clients/4');
        await flushPromises();
        await router.push('/businesses/7/clients/3');
        await flushPromises();
        saveRequest.resolve();
        await saving;

        // Assert: the heading shows the rename the form says was saved
        expect(state.value).toStrictEqual({ kind: 'found', client: renamed });
    });
});
