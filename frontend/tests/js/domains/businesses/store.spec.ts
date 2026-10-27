import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import * as auth from '@/services/auth';
import * as service from '@/services/businesses';
import { useAuthStore } from '@/domains/auth/store';
import { useBusinessesStore } from '@/domains/businesses/store';
import { axiosErrorWith } from '../../utility/axiosErrorWith';
import { createDeferred } from '../../utility/createDeferred';

// Every export of both services becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');
vi.mock('@/services/businesses');

type BusinessesStore = ReturnType<typeof useBusinessesStore>;

const jan = { id: 1, name: 'Jan de Vries', email: 'jan@example.nl' };
const piet = { id: 2, name: 'Piet Bakker', email: 'piet@example.nl' };

const business = (id: number, legalName: string): service.Business => ({
    id,
    legal_name: legalName,
    kvk_number: `1234567${id}`,
    vat_number: 'NL123456789B01',
    street: 'Keizersgracht',
    house_number: '123',
    house_number_addition: null,
    postal_code: '1015 CJ',
    city: 'Amsterdam',
    region: null,
    country_code: 'NL',
    payment_term_days: 30,
});

const bakery = business(1, 'Bakkerij de Vries');
const studio = business(2, 'Studio de Vries');
const shop = business(3, 'Winkel de Vries');

const payload: service.BusinessPayload = {
    legal_name: 'Winkel de Vries',
    kvk_number: '12345673',
    vat_number: 'NL123456789B01',
    street: 'Keizersgracht',
    house_number: '123',
    house_number_addition: null,
    postal_code: '1015 CJ',
    city: 'Amsterdam',
    country_code: 'NL',
    payment_term_days: 30,
};

// Logs in through the real auth store, since its user is private to it.
const logInAs = async (user: auth.User): Promise<void> =>
{
    vi.mocked(auth.login).mockResolvedValue(user);
    await useAuthStore().login({ email: user.email, password: 'secret-password' });
};

describe('businesses store', () =>
{
    beforeEach(() =>
    {
        // A fresh Pinia per test, so no test starts with another's list or user.
        setActivePinia(createPinia());
        vi.resetAllMocks();
    });

    it('should start with no list', async () =>
    {
        // Arrange
        await logInAs(jan);

        // Act
        const store = useBusinessesStore();

        // Assert: null means unknown, not "no businesses"
        expect(store.businesses).toBeNull();
    });

    it('should fill the list from listBusinesses on load()', async () =>
    {
        // Arrange
        await logInAs(jan);
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);
        const store = useBusinessesStore();

        // Act
        await store.load();

        // Assert
        expect(store.businesses).toStrictEqual([bakery, studio]);
    });

    it('should send one request for a load() while loading and a load() after it answered', async () =>
    {
        // Arrange: a request the test answers by hand
        await logInAs(jan);
        const request = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(request.promise.then(() => [bakery]));
        const store = useBusinessesStore();

        // Act: the second call is made while the first is in flight
        const first = store.load();
        const second = store.load();
        request.resolve();
        await Promise.all([first, second]);
        await store.load();

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(store.businesses).toStrictEqual([bakery]);
    });

    it('should send a new request on reload() and replace the list', async () =>
    {
        // Arrange
        await logInAs(jan);
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([bakery]).mockResolvedValueOnce([bakery, studio]);
        const store = useBusinessesStore();
        await store.load();

        // Act
        await store.reload();

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(store.businesses).toStrictEqual([bakery, studio]);
    });

    it('should reject load() with the error of a failed request, and send a new request on the next load()', async () =>
    {
        // Arrange: the first request fails with a 500 (server error), the second answers
        await logInAs(jan);
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses).mockRejectedValueOnce(error).mockResolvedValueOnce([bakery]);
        const store = useBusinessesStore();

        // Act + Assert: the caller gets the error, and the list stays unknown
        await expect(store.load()).rejects.toBe(error);
        expect(store.businesses).toBeNull();

        // Act: the failure was not cached
        await store.load();

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(store.businesses).toStrictEqual([bakery]);
    });

    it('should keep the newer list when an older request answers after a reload()', async () =>
    {
        // Arrange: the first request is held, the reload's answers at once
        await logInAs(jan);
        const older = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() => [bakery]))
            .mockResolvedValueOnce([bakery, studio]);
        const store = useBusinessesStore();
        const load = store.load();
        await store.reload();

        // Act: the older request answers last
        older.resolve();
        await load;

        // Assert
        expect(store.businesses).toStrictEqual([bakery, studio]);
    });

    it('should settle a load() with its own list when it answers while a newer reload() is still in flight', async () =>
    {
        // Arrange: both requests are held, so the test decides the order
        await logInAs(jan);
        const older = createDeferred();
        const newer = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() => [bakery]))
            .mockReturnValueOnce(newer.promise.then(() => [bakery, studio]));
        const store = useBusinessesStore();
        const load = store.load();
        const reload = store.reload();

        // Act: the older answers first
        older.resolve();
        await load;

        // Assert: the load() caller gets a list, not null while the reload() is out
        expect(store.businesses).toStrictEqual([bakery]);

        // Act: the newer answers
        newer.resolve();
        await reload;

        // Assert
        expect(store.businesses).toStrictEqual([bakery, studio]);
    });

    it('should join a reload() still in flight after an older load() failed, instead of sending another request', async () =>
    {
        // Arrange: both requests are held; the older one will fail with a 500 (server error)
        await logInAs(jan);
        const older = createDeferred();
        const newer = createDeferred();
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() =>
            {
                throw error;
            }))
            .mockReturnValueOnce(newer.promise.then(() => [bakery]));
        const store = useBusinessesStore();
        const first = store.load();
        const reload = store.reload();
        older.resolve();
        await expect(first).rejects.toBe(error);

        // Act: the older request's failure must not have forgotten the newer one
        const second = store.load();
        newer.resolve();
        await Promise.all([second, reload]);

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(store.businesses).toStrictEqual([bakery]);
    });

    it('should send nothing on load() and reload() while logged out', async () =>
    {
        // Arrange: nobody logged in
        const store = useBusinessesStore();

        // Act
        await store.load();
        await store.reload();

        // Assert: the backend would answer 401 (unauthenticated), so nothing is asked
        expect(service.listBusinesses).not.toHaveBeenCalled();
        expect(store.businesses).toBeNull();
    });

    it('should find a business of the list by id, and return undefined for an id that is not in it', async () =>
    {
        // Arrange
        await logInAs(jan);
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);
        const store = useBusinessesStore();
        await store.load();

        // Act + Assert
        expect(store.byId(2)).toStrictEqual(studio);
        expect(store.byId(99)).toBeUndefined();
    });

    it('should return undefined from byId() before the list is loaded', async () =>
    {
        // Arrange
        await logInAs(jan);
        const store = useBusinessesStore();

        // Act + Assert
        expect(store.byId(1)).toBeUndefined();
    });

    it('should post the payload on create(), reload the list and return the business', async () =>
    {
        // Arrange
        await logInAs(jan);
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([bakery, studio]).mockResolvedValueOnce([bakery, studio, shop]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const store = useBusinessesStore();
        await store.load();

        // Act
        const result = await store.create(payload);

        // Assert
        expect(service.createBusiness).toHaveBeenCalledExactlyOnceWith(payload);
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(result).toStrictEqual(shop);
        expect(store.businesses).toStrictEqual([bakery, studio, shop]);
    });

    it('should keep the list of the reload after create() when a load() sent before the create answers last', async () =>
    {
        // Arrange: the first list request is held, and answers with the list from before the create
        await logInAs(jan);
        const older = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() => [bakery]))
            .mockResolvedValueOnce([bakery, shop]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const store = useBusinessesStore();
        const load = store.load();
        await store.create(payload);

        // Act: the list from before the create answers last
        older.resolve();
        await load;

        // Assert
        expect(store.businesses).toStrictEqual([bakery, shop]);
    });

    it('should rethrow a 422 (unprocessable) from create(), send no reload and leave the list unchanged', async () =>
    {
        // Arrange
        await logInAs(jan);
        const error = axiosErrorWith(422, { message: 'Invalid', errors: { kvk_number: ['The kvk number has already been taken.'] } });
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(service.createBusiness).mockRejectedValue(error);
        const store = useBusinessesStore();
        await store.load();

        // Act + Assert: useForm needs the original error to show it next to the field
        await expect(store.create(payload)).rejects.toBe(error);

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(store.businesses).toStrictEqual([bakery]);
    });

    it('should put the payload on update(), reload the list and return the business', async () =>
    {
        // Arrange
        await logInAs(jan);
        const renamed = { ...bakery, legal_name: 'Bakkerij en Lunchroom de Vries' };
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([bakery, studio]).mockResolvedValueOnce([renamed, studio]);
        vi.mocked(service.updateBusiness).mockResolvedValue(renamed);
        const store = useBusinessesStore();
        await store.load();

        // Act
        const result = await store.update(1, payload);

        // Assert
        expect(service.updateBusiness).toHaveBeenCalledExactlyOnceWith(1, payload);
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(result).toStrictEqual(renamed);
        expect(store.businesses).toStrictEqual([renamed, studio]);
    });

    it('should rethrow a 422 (unprocessable) from update(), send no reload and leave the list unchanged', async () =>
    {
        // Arrange
        await logInAs(jan);
        const error = axiosErrorWith(422, { message: 'Invalid', errors: { legal_name: ['The legal name field is required.'] } });
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(service.updateBusiness).mockRejectedValue(error);
        const store = useBusinessesStore();
        await store.load();

        // Act + Assert
        await expect(store.update(1, payload)).rejects.toBe(error);

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(store.businesses).toStrictEqual([bakery]);
    });

    it.for([
        { name: 'create()', write: (store: BusinessesStore) => store.create(payload) },
        { name: 'update()', write: (store: BusinessesStore) => store.update(3, payload) },
    ])('should resolve with the business, and leave the list unknown until the next load(), when the reload after a write fails: $name', async ({ write }) =>
    {
        // Arrange: the reload after the write fails with a 500 (server error)
        await logInAs(jan);
        vi.mocked(service.listBusinesses)
            .mockResolvedValueOnce([bakery])
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakery, shop]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        vi.mocked(service.updateBusiness).mockResolvedValue(shop);
        const store = useBusinessesStore();
        await store.load();

        // Act
        const result = await write(store);

        // Assert: the write landed, so the page can go on with it; the list from before it isn't handed out
        expect(result).toStrictEqual(shop);
        expect(store.businesses).toBeNull();

        // Act
        await store.load();

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledTimes(3);
        expect(store.businesses).toStrictEqual([bakery, shop]);
    });

    it('should send a new request for a load() sent before a write whose answer comes after the reload after the write failed', async () =>
    {
        // Arrange: the first list request is held; the reload after the create fails with a 500 (server error)
        await logInAs(jan);
        const older = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() => [bakery]))
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakery, shop]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const store = useBusinessesStore();
        const load = store.load();
        await store.create(payload);

        // Act: the list from before the create answers last, and is dropped
        older.resolve();
        await load;

        // Assert: load() resolved with a list that holds the new business, not with none
        expect(service.listBusinesses).toHaveBeenCalledTimes(3);
        expect(store.businesses).toStrictEqual([bakery, shop]);
    });

    it('should hand out no list after logout()', async () =>
    {
        // Arrange
        await logInAs(jan);
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(auth.logout).mockResolvedValue();
        const store = useBusinessesStore();
        await store.load();

        // Act
        await useAuthStore().logout();

        // Assert
        expect(store.businesses).toBeNull();
        expect(store.byId(1)).toBeUndefined();
    });

    it('should hand out no list after the auth store is cleared, as after a password reset', async () =>
    {
        // Arrange
        await logInAs(jan);
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        const store = useBusinessesStore();
        await store.load();

        // Act
        useAuthStore().clear();

        // Assert
        expect(store.businesses).toBeNull();
    });

    it('should not hand one user\'s list to the next user who logs in, and load() asks for theirs', async () =>
    {
        // Arrange: Jan's list is loaded, then Piet logs in in the same tab without a page load
        await logInAs(jan);
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([bakery]).mockResolvedValueOnce([studio]);
        const store = useBusinessesStore();
        await store.load();
        useAuthStore().clear();
        await logInAs(piet);

        // Assert: not Jan's list
        expect(store.businesses).toBeNull();

        // Act
        await store.load();

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(store.businesses).toStrictEqual([studio]);
    });

    it('should not hand a list to the next user when the previous user\'s request answers after they logged in', async () =>
    {
        // Arrange: Jan's request is held while Piet logs in
        await logInAs(jan);
        const janRequest = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValueOnce(janRequest.promise.then(() => [bakery]));
        const store = useBusinessesStore();
        const janLoad = store.load();
        useAuthStore().clear();
        await logInAs(piet);

        // Act
        janRequest.resolve();
        await janLoad;

        // Assert
        expect(store.businesses).toBeNull();
    });

    it('should send a new request for the next user\'s load() while the previous user\'s is in flight', async () =>
    {
        // Arrange: Jan's request is held while Piet logs in and loads
        await logInAs(jan);
        const janRequest = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(janRequest.promise.then(() => [bakery]))
            .mockResolvedValueOnce([studio]);
        const store = useBusinessesStore();
        const janLoad = store.load();
        useAuthStore().clear();
        await logInAs(piet);

        // Act: Piet's load() doesn't wait for Jan's request, and Jan's answers last
        await store.load();
        janRequest.resolve();
        await janLoad;

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(store.businesses).toStrictEqual([studio]);
    });
});
