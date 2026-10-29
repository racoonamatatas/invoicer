import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { defineComponent, ref } from 'vue';

import { useBusinessList } from '@/domains/businesses/composables/useBusinessList';
import { useBusinessesStore } from '@/domains/businesses/store';
import * as service from '@/services/businesses';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { createDeferred } from '../../../utility/createDeferred';

// Every export of both services becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');
vi.mock('@/services/businesses');

// Unmounted after each test, so a host's watchers stop with it.
enableAutoUnmount(afterEach);

const bakery = business(1, 'Bakkerij de Vries');
const shop = business(3, 'Winkel de Vries');

const payload: service.BusinessPayload = {
    registered_name: 'Winkel de Vries',
    kvk_number: '12345673',
    vat_number: 'NL123456789B01',
    street: 'Oosterstraat',
    house_number: '123',
    house_number_addition: null,
    postal_code: '9711 LM',
    city: 'Groningen',
    country_code: 'NL',
    payment_term_days: 30,
};

// A composable's watchers only run inside a component's setup, so a host
// component that renders nothing calls it, the way a page does. Fresh Pinia
// and a logged-in user, since the store loads nothing without one.
const mountBusinessList = async (isNeeded?: () => boolean, errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    let list: ReturnType<typeof useBusinessList> | undefined;
    const Host = defineComponent({
        setup()
        {
            list = useBusinessList(isNeeded);

            return () => null;
        },
    });
    mount(Host, { global: { plugins: [pinia], config: { errorHandler } } });

    if (list === undefined)
    {
        throw new Error('Host did not run its setup');
    }

    return { ...list, store: useBusinessesStore() };
};

describe('useBusinessList', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should be loading while listBusinesses is in flight, then loaded when it gets a 200 (ok)', async () =>
    {
        // Arrange: listBusinesses is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(request.promise.then(() => [bakery]));

        // Act
        const { state } = await mountBusinessList();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'loading' });

        // Act
        request.resolve();
        await flushPromises();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'loaded', businesses: [bakery] });
    });

    it('should send no request while isNeeded is false, and load as soon as it turns true', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        const isNeeded = ref(false);
        const { state } = await mountBusinessList(() => isNeeded.value);
        await flushPromises();

        // Assert: nothing asked for
        expect(service.listBusinesses).not.toHaveBeenCalled();

        // Act
        isNeeded.value = true;
        await flushPromises();

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(state.value.kind).toBe('loaded');
    });

    it('should be failed, hand the error on and not ask again by itself when listBusinesses fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { state } = await mountBusinessList(undefined, errorHandler);
        await flushPromises();

        // Assert (outcome)
        expect(state.value).toStrictEqual({ kind: 'failed' });

        // Assert (interaction): one request, so a backend that is down isn't
        // asked in a loop, and the error reached Vue's handler as it was
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);
    });

    it('should be loaded when retry gets a 200 (ok) after a failed load', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses)
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakery]);
        const { state, retry } = await mountBusinessList(undefined, () =>
        {});
        await flushPromises();

        // Act
        await retry();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'loaded', businesses: [bakery] });
    });

    it('should load the list again when the reload after createBusiness fails with a 500 (server error) and empties it while it is needed', async () =>
    {
        // Arrange: loaded; the store's reload after the write fails, which
        // empties the list; the next request brings it with the new business
        vi.mocked(service.listBusinesses)
            .mockResolvedValueOnce([bakery])
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakery, shop]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const { state, store } = await mountBusinessList();
        await flushPromises();

        // Act
        await store.create(payload);
        await flushPromises();

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledTimes(3);
        expect(state.value).toStrictEqual({ kind: 'loaded', businesses: [bakery, shop] });
    });

    it('should not load the list again when it is emptied while isNeeded is false', async () =>
    {
        // Arrange: loaded while needed, then no longer needed
        vi.mocked(service.listBusinesses)
            .mockResolvedValueOnce([bakery])
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }));
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const isNeeded = ref(true);
        const { store } = await mountBusinessList(() => isNeeded.value);
        await flushPromises();
        isNeeded.value = false;

        // Act
        await store.create(payload);
        await flushPromises();

        // Assert: the first load and the store's failed reload, nothing more
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
    });

    it('should be loaded, not failed, when a list reaches the store through store.reload() after a failed load', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses)
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakery]);
        const { state, store } = await mountBusinessList(undefined, () =>
        {});
        await flushPromises();

        // Act: another caller fills the store, the way Businesses.vue's
        // reload on a visible tab does
        await store.reload();

        // Assert
        expect(state.value).toStrictEqual({ kind: 'loaded', businesses: [bakery] });
    });
});
