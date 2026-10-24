import { flushPromises } from '@vue/test-utils';
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

    it('should settle a failed load() with the list of a newer reload() still in flight, instead of rejecting', async () =>
    {
        // Arrange: both requests are held; the older one will fail with a 500 (server error)
        await logInAs(jan);
        const older = createDeferred();
        const newer = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() =>
            {
                throw axiosErrorWith(500, { message: 'Server Error' });
            }))
            .mockReturnValueOnce(newer.promise.then(() => [bakery, studio]));
        const store = useBusinessesStore();
        let loadSettled = false;
        const load = store.load().finally(() =>
        {
            loadSettled = true;
        });
        const reload = store.reload();

        // Act: the older fails first
        older.resolve();
        await flushPromises();

        // Assert: still waiting for the newer request
        expect(loadSettled).toBe(false);

        // Act
        newer.resolve();
        await Promise.all([load, reload]);

        // Assert: resolved, with the newer list
        expect(store.businesses).toStrictEqual([bakery, studio]);
    });

    it('should settle a failed load() without an error when a newer list is already stored', async () =>
    {
        // Arrange: the older request is held and will fail; the reload() answers at once
        await logInAs(jan);
        const older = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() =>
            {
                throw axiosErrorWith(500, { message: 'Server Error' });
            }))
            .mockResolvedValueOnce([bakery, studio]);
        const store = useBusinessesStore();
        const load = store.load();
        await store.reload();

        // Act
        older.resolve();

        // Assert: resolves, and the stored list stays
        await expect(load).resolves.toBeUndefined();
        expect(store.businesses).toStrictEqual([bakery, studio]);
    });

    it('should keep the older list when the newer reload() fails before it answers', async () =>
    {
        // Arrange: the older request is held; the reload() fails with a 500 (server error)
        await logInAs(jan);
        const older = createDeferred();
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() => [bakery]))
            .mockRejectedValueOnce(error);
        const store = useBusinessesStore();
        const load = store.load();
        await expect(store.reload()).rejects.toBe(error);

        // Act
        older.resolve();
        await load;

        // Assert: no newer list exists, so the older one is the best there is
        expect(store.businesses).toStrictEqual([bakery]);
    });

    it('should join the older load() still in flight after a newer reload() failed, instead of sending another request', async () =>
    {
        // Arrange: the first request is held; the reload() fails with a 500 (server error)
        await logInAs(jan);
        const older = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() => [bakery]))
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }));
        const store = useBusinessesStore();
        const first = store.load();
        await store.reload().catch(() => undefined);

        // Act
        const second = store.load();
        older.resolve();
        await Promise.all([first, second]);

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(store.businesses).toStrictEqual([bakery]);
    });

    it('should reject a failed load() of the previous user instead of sharing the next user\'s request in flight', async () =>
    {
        // Arrange: Jan's request is held and will fail; Piet logs in and his request is held too
        await logInAs(jan);
        const janRequest = createDeferred();
        const pietRequest = createDeferred();
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(janRequest.promise.then(() =>
            {
                throw error;
            }))
            .mockReturnValueOnce(pietRequest.promise.then(() => [studio]));
        const store = useBusinessesStore();
        const janLoad = store.load();
        useAuthStore().clear();
        await logInAs(piet);
        const pietLoad = store.load();

        // Act
        janRequest.resolve();

        // Assert: Jan's caller gets Jan's failure, not Piet's outcome
        await expect(janLoad).rejects.toBe(error);
        pietRequest.resolve();
        await pietLoad;
    });

    it('should reject a failed load() of the previous user instead of settling with the next user\'s stored list', async () =>
    {
        // Arrange: Jan's request is held and will fail; Piet logs in and his list is stored
        await logInAs(jan);
        const janRequest = createDeferred();
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(janRequest.promise.then(() =>
            {
                throw error;
            }))
            .mockResolvedValueOnce([studio]);
        const store = useBusinessesStore();
        const janLoad = store.load();
        useAuthStore().clear();
        await logInAs(piet);
        await store.load();

        // Act
        janRequest.resolve();

        // Assert
        await expect(janLoad).rejects.toBe(error);
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

    it('should post the payload on create(), append the business to the list and return it', async () =>
    {
        // Arrange
        await logInAs(jan);
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const store = useBusinessesStore();
        await store.load();

        // Act
        const result = await store.create(payload);

        // Assert
        expect(service.createBusiness).toHaveBeenCalledExactlyOnceWith(payload);
        expect(result).toStrictEqual(shop);
        expect(store.businesses).toStrictEqual([bakery, studio, shop]);
    });

    it('should leave the list unknown after create() when it was not loaded', async () =>
    {
        // Arrange
        await logInAs(jan);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const store = useBusinessesStore();

        // Act
        await store.create(payload);

        // Assert: a list of only the new business would hide the others; load() fetches them all
        expect(store.businesses).toBeNull();
    });

    it('should hold the created business when a load() sent before it answers after it', async () =>
    {
        // Arrange: the list request is held, and answers with the list from before the create
        await logInAs(jan);
        const list = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(list.promise.then(() => [bakery]));
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const store = useBusinessesStore();
        const load = store.load();

        // Act: the create answers first, the stale list last
        const create = store.create(payload);
        list.resolve();
        await Promise.all([load, create]);

        // Assert
        expect(store.businesses).toStrictEqual([bakery, shop]);
    });

    it('should hold the created business once when the list already has it', async () =>
    {
        // Arrange: the list was sent after the business was stored, so it already holds it
        await logInAs(jan);
        const list = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(list.promise.then(() => [bakery, shop]));
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const store = useBusinessesStore();
        const load = store.load();

        // Act
        const create = store.create(payload);
        list.resolve();
        await Promise.all([load, create]);

        // Assert
        expect(store.businesses).toStrictEqual([bakery, shop]);
    });

    it('should rethrow a 422 (unprocessable) from create() and leave the list unchanged', async () =>
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
        expect(store.businesses).toStrictEqual([bakery]);
    });

    it('should put the payload on update(), replace the business in place and return it', async () =>
    {
        // Arrange
        await logInAs(jan);
        const renamed = { ...bakery, legal_name: 'Bakkerij en Lunchroom de Vries' };
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);
        vi.mocked(service.updateBusiness).mockResolvedValue(renamed);
        const store = useBusinessesStore();
        await store.load();

        // Act
        const result = await store.update(1, payload);

        // Assert: same position, not removed and appended
        expect(service.updateBusiness).toHaveBeenCalledExactlyOnceWith(1, payload);
        expect(result).toStrictEqual(renamed);
        expect(store.businesses).toStrictEqual([renamed, studio]);
    });

    it('should hold the updated business when a load() sent before it answers after it', async () =>
    {
        // Arrange: the list request is held, and answers with the business as it was before the update
        await logInAs(jan);
        const renamed = { ...bakery, legal_name: 'Bakkerij en Lunchroom de Vries' };
        const list = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(list.promise.then(() => [bakery, studio]));
        vi.mocked(service.updateBusiness).mockResolvedValue(renamed);
        const store = useBusinessesStore();
        const load = store.load();

        // Act: the update answers first, the stale list last
        const update = store.update(1, payload);
        list.resolve();
        await Promise.all([load, update]);

        // Assert
        expect(store.businesses).toStrictEqual([renamed, studio]);
    });

    it('should hold the updated business when an older list request answers after a newer reload() failed', async () =>
    {
        // Arrange: a loaded list, then a held reload() and a failing one, so the newest request is gone while an older one is out
        await logInAs(jan);
        const renamed = { ...bakery, legal_name: 'Bakkerij en Lunchroom de Vries' };
        const older = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockResolvedValueOnce([bakery, studio])
            .mockReturnValueOnce(older.promise.then(() => [bakery, studio]))
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }));
        vi.mocked(service.updateBusiness).mockResolvedValue(renamed);
        const store = useBusinessesStore();
        await store.load();
        const reload = store.reload();
        await store.reload().catch(() => undefined);

        // Act: the update has answered before the held list with the old name answers
        const update = store.update(1, payload);
        await flushPromises();
        older.resolve();
        await Promise.all([reload, update]);

        // Assert
        expect(store.businesses).toStrictEqual([renamed, studio]);
    });

    it('should hold the updated business when the first load() answers after a reload() failed and the update answered', async () =>
    {
        // Arrange: nothing loaded yet; the first request is held, the reload() fails
        await logInAs(jan);
        const renamed = { ...bakery, legal_name: 'Bakkerij en Lunchroom de Vries' };
        const older = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockReturnValueOnce(older.promise.then(() => [bakery, studio]))
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }));
        vi.mocked(service.updateBusiness).mockResolvedValue(renamed);
        const store = useBusinessesStore();
        const load = store.load();
        await store.reload().catch(() => undefined);

        // Act: the update has answered before the held list with the old name answers
        const update = store.update(1, payload);
        await flushPromises();
        older.resolve();
        await Promise.all([load, update]);

        // Assert
        expect(store.businesses).toStrictEqual([renamed, studio]);
    });

    it('should rethrow a 422 (unprocessable) from update() and leave the list unchanged', async () =>
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
        expect(store.businesses).toStrictEqual([bakery]);
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

    it('should not add a business created by the previous user to the next user\'s list', async () =>
    {
        // Arrange: Jan's create is held while Piet logs in and loads his own list
        await logInAs(jan);
        const janCreate = createDeferred();
        vi.mocked(service.createBusiness).mockReturnValue(janCreate.promise.then(() => shop));
        vi.mocked(service.listBusinesses).mockResolvedValue([studio]);
        const store = useBusinessesStore();
        const create = store.create(payload);
        useAuthStore().clear();
        await logInAs(piet);
        await store.load();

        // Act
        janCreate.resolve();
        await create;

        // Assert
        expect(store.businesses).toStrictEqual([studio]);
    });

    it('should not put a business updated by the previous user into the next user\'s list', async () =>
    {
        // Arrange: Jan's update is held while Piet logs in and loads his own list
        await logInAs(jan);
        const janUpdate = createDeferred();
        vi.mocked(service.updateBusiness).mockReturnValue(janUpdate.promise.then(() => ({ ...studio, legal_name: 'Studio Jan' })));
        vi.mocked(service.listBusinesses).mockResolvedValue([studio]);
        const store = useBusinessesStore();
        const update = store.update(2, payload);
        useAuthStore().clear();
        await logInAs(piet);
        await store.load();

        // Act
        janUpdate.resolve();
        await update;

        // Assert
        expect(store.businesses).toStrictEqual([studio]);
    });
});
