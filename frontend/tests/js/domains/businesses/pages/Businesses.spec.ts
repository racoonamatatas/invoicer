import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import Businesses from '@/domains/businesses/pages/Businesses.vue';
import { useBusinessesStore } from '@/domains/businesses/store';
import * as service from '@/services/businesses';
import { SessionEndedError } from '@/services/http';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { createDeferred } from '../../../utility/createDeferred';
import { createTestRouter } from '../../../utility/createTestRouter';

// Every export of both services becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');
vi.mock('@/services/businesses');

// Unmounts every page after each test. The page listens on document, which
// outlives a test, so a page left mounted would answer the next test's events.
enableAutoUnmount(afterEach);

// Top level, so it runs after the tests of both describes: setVisibility's
// spy on document.visibilityState would otherwise outlive its test.
afterEach(() =>
{
    vi.restoreAllMocks();
});

const bakery = business(1, 'Bakkerij de Vries');
const studio = business(2, 'Studio de Vries');

// Mounts Businesses on /businesses with a fresh Pinia, a logged-in user (the
// store loads nothing without one) and the app's real routes. Returns the
// router too, for the tests that follow a navigation.
const mountBusinessesWithRouter = async (errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push({ name: 'businesses' });

    const wrapper = mount(Businesses, { global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router };
};

const mountBusinesses = async (errorHandler?: (error: unknown) => void) => (await mountBusinessesWithRouter(errorHandler)).wrapper;

type Wrapper = Awaited<ReturnType<typeof mountBusinesses>>;

// A button found by its text, the way a user finds it. undefined when absent.
const buttonNamed = (wrapper: Wrapper, text: string) => wrapper.findAll('button').find((button) => button.text() === text);

// Tells the page the tab was shown or hidden, the way the browser does.
const setVisibility = (state: DocumentVisibilityState): void =>
{
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    document.dispatchEvent(new Event('visibilitychange'));
};

describe('Businesses page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should show Loading... in the status region while listBusinesses is in flight', async () =>
    {
        // Arrange: listBusinesses is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(request.promise.then(() => []));

        // Act
        const wrapper = await mountBusinesses();

        // Assert
        expect(wrapper.find('[role="status"]').text()).toBe('Loading...');

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should list the registered name and KvK number of each business when listBusinesses gets a 200 (ok)', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);

        // Act
        const wrapper = await mountBusinesses();
        await flushPromises();

        // Assert: in the backend's order, and the status region is quiet again
        expect(wrapper.findAll('li').map((item) => item.text())).toStrictEqual([
            'Bakkerij de Vries (KvK 12345671)',
            'Studio de Vries (KvK 12345672)',
        ]);
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    it('should link each registered name to its business\'s dashboard', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);

        // Act
        const wrapper = await mountBusinesses();
        await flushPromises();

        // Assert: each id in its own link, so no row opens the other business
        expect(wrapper.findAll('li a').map((anchor) => [anchor.text(), anchor.attributes('href')])).toStrictEqual([
            ['Bakkerij de Vries', '/businesses/1'],
            ['Studio de Vries', '/businesses/2'],
        ]);
    });

    it('should say there are no businesses yet when listBusinesses gets a 200 (ok) with an empty list', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([]);

        // Act
        const wrapper = await mountBusinesses();
        await flushPromises();

        // Assert
        expect(wrapper.text()).toContain('You have no businesses yet.');
        expect(wrapper.find('ul').exists()).toBe(false);
    });

    it('should offer Log out and link to /change-password when listBusinesses gets a 200 (ok) with an empty list, since this is the only page such a user has', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([]);

        // Act
        const wrapper = await mountBusinesses();
        await flushPromises();

        // Assert: found by their text the way a user finds them
        expect(wrapper.text()).toContain('You have no businesses yet.');
        expect(buttonNamed(wrapper, 'Log out')).toBeDefined();
        const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'Change password');
        expect(link?.attributes('href')).toBe('/change-password');
    });

    it('should show the failure with a Try again button and hand the error on when listBusinesses fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler,
        // where Vue sends a rejected onMounted hook
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const wrapper = await mountBusinesses(errorHandler);
        await flushPromises();

        // Assert (outcome): the user is told, and can retry
        expect(wrapper.find('[role="status"]').text()).toBe('Couldn\'t load your businesses.');
        expect(buttonNamed(wrapper, 'Try again')).toBeDefined();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);
    });

    it('should not hand the error on when listBusinesses fails with a 401 (unauthenticated) that ended the session', async () =>
    {
        // Arrange: the http layer already logged the user out and is loading
        // /login, so there is nothing left for the page to report
        vi.mocked(service.listBusinesses).mockRejectedValue(new SessionEndedError(axiosErrorWith(401, { message: 'Unauthenticated.' })));
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        await mountBusinesses(errorHandler);
        await flushPromises();

        // Assert (interaction)
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should list the businesses when Try again gets a 200 (ok) after a failed load', async () =>
    {
        // Arrange: the first request fails, the retry succeeds
        vi.mocked(service.listBusinesses)
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakery]);
        const wrapper = await mountBusinesses(() =>
        {});
        await flushPromises();

        // Act
        await buttonNamed(wrapper, 'Try again')?.trigger('click');
        await flushPromises();

        // Assert: the list replaced the failure, button included
        expect(wrapper.findAll('li').map((item) => item.text())).toStrictEqual(['Bakkerij de Vries (KvK 12345671)']);
        expect(wrapper.find('[role="status"]').text()).toBe('');
        expect(buttonNamed(wrapper, 'Try again')).toBeUndefined();
    });

    it('should ask listBusinesses again and show the new list when the tab becomes visible', async () =>
    {
        // Arrange: a business was added in another tab between the two requests
        vi.mocked(service.listBusinesses)
            .mockResolvedValueOnce([bakery])
            .mockResolvedValueOnce([bakery, studio]);
        const wrapper = await mountBusinesses();
        await flushPromises();

        // Act
        setVisibility('visible');
        await flushPromises();

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(wrapper.findAll('li')).toHaveLength(2);
    });

    it('should not ask listBusinesses again when the tab becomes hidden', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        await mountBusinesses();
        await flushPromises();

        // Act
        setVisibility('hidden');
        await flushPromises();

        // Assert: only the request from mounting
        expect(service.listBusinesses).toHaveBeenCalledOnce();
    });

    it('should not ask listBusinesses again when the tab becomes visible after the page is left', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        const wrapper = await mountBusinesses();
        await flushPromises();
        wrapper.unmount();

        // Act
        setVisibility('visible');
        await flushPromises();

        // Assert: the listener went with the page
        expect(service.listBusinesses).toHaveBeenCalledOnce();
    });

    it('should keep the list on screen and not hand the error on when the reload on a visible tab fails with a 500 (server error)', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses)
            .mockResolvedValueOnce([bakery])
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }));
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountBusinesses(errorHandler);
        await flushPromises();

        // Act
        setVisibility('visible');
        await flushPromises();

        // Assert: the refresh was sent and failed, and the last good list stays
        expect(service.listBusinesses).toHaveBeenCalledTimes(2);
        expect(wrapper.findAll('li').map((item) => item.text())).toStrictEqual(['Bakkerij de Vries (KvK 12345671)']);
        expect(errorHandler).not.toHaveBeenCalled();
    });
});

describe('Businesses page, create form', () =>
{
    const addForm = 'form[aria-label="Add a business"]';

    // What the user types, and the payload the backend must receive for it:
    // the address flat again, country_code added, the default payment term
    // sent as the number 30.
    const typed = {
        registered_name: 'Winkel de Vries',
        kvk_number: '12345673',
        vat_number: 'NL123456789B01',
        street: 'Oosterstraat',
        house_number: '123',
        house_number_addition: 'A',
        postal_code: '9711 LM',
        city: 'Groningen',
    };
    const expectedPayload: service.BusinessPayload = { ...typed, country_code: 'NL', payment_term_days: 30 };
    const shop = business(3, 'Winkel de Vries');

    // Types every text field the way a user does; the payment term keeps its default.
    const fillForm = async (wrapper: Wrapper) =>
    {
        for (const [field, value] of Object.entries(typed))
        {
            await wrapper.find(`#business-${field}`).setValue(value);
        }
    };

    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should not show the form while listBusinesses is in flight, so it can\'t flash open for a user with businesses', async () =>
    {
        // Arrange
        const request = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(request.promise.then(() => [bakery]));

        // Act
        const wrapper = await mountBusinesses();

        // Assert: the page is loading, and neither the form nor its button is there
        expect(wrapper.find('[role="status"]').text()).toBe('Loading...');
        expect(wrapper.find(addForm).exists()).toBe(false);
        expect(buttonNamed(wrapper, 'Add a business')).toBeUndefined();

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should open the form, without Add a business or Cancel, when listBusinesses gets a 200 (ok) with an empty list', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([]);

        // Act
        const wrapper = await mountBusinesses();
        await flushPromises();

        // Assert: adding a business is all there is to do
        expect(wrapper.find(addForm).exists()).toBe(true);
        expect(buttonNamed(wrapper, 'Add a business')).toBeUndefined();
        expect(buttonNamed(wrapper, 'Cancel')).toBeUndefined();
    });

    it('should mark the page\'s own fields required, as the backend does', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([]);

        // Act
        const wrapper = await mountBusinesses();
        await flushPromises();

        // Assert: none left without it, so a failure names the field. The
        // address fields are AddressFields' own, checked in its spec
        const fields = ['registered_name', 'kvk_number', 'vat_number', 'payment_term_days'];
        const notRequired = fields.filter((field) => wrapper.find(`#business-${field}`).attributes('required') === undefined);
        expect(notRequired).toStrictEqual([]);
    });

    it('should label the name input "Registered name", the name the business has in the KvK register', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([]);

        // Act
        const wrapper = await mountBusinesses();
        await flushPromises();

        // Assert: through label[for], the link a screen reader names the input by,
        // since every other spec finds the input by id and passes with any label
        expect(wrapper.find('label[for="business-registered_name"]').text()).toBe('Registered name');
    });

    it('should keep the form that opened for an empty list, and what was typed in it, when the reload on a visible tab gets a 200 (ok) with a business', async () =>
    {
        // Arrange: empty at first; a business is added in another tab while
        // the user is away from this one
        vi.mocked(service.listBusinesses)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([bakery]);
        const wrapper = await mountBusinesses();
        await flushPromises();
        await wrapper.find('#business-registered_name').setValue('Winkel de Vries');

        // Act
        setVisibility('visible');
        await flushPromises();

        // Assert: the reload arrived, so the form outlived it
        expect(wrapper.findAll('li').map((item) => item.text())).toStrictEqual(['Bakkerij de Vries (KvK 12345671)']);
        expect(wrapper.find(addForm).exists()).toBe(true);
        expect(wrapper.find<HTMLInputElement>('#business-registered_name').element.value).toBe('Winkel de Vries');

        // Assert: with a list to go back to, Cancel is there now
        expect(buttonNamed(wrapper, 'Cancel')).toBeDefined();
    });

    it('should keep the open form, and what was typed in it, while the list loads again after a write elsewhere empties it', async () =>
    {
        // Arrange: loaded with a business, form opened and typed in. Another
        // write's reload fails, which empties the store; the page's own load
        // after that is held in flight by the test
        const request = createDeferred();
        vi.mocked(service.listBusinesses)
            .mockResolvedValueOnce([bakery])
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockReturnValueOnce(request.promise.then(() => [bakery, shop]));
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const wrapper = await mountBusinesses();
        await flushPromises();
        await buttonNamed(wrapper, 'Add a business')?.trigger('click');
        await wrapper.find('#business-registered_name').setValue('Studio de Vries');

        // Act: a write from outside this form, the way a later page will
        await useBusinessesStore().create(expectedPayload);
        await flushPromises();

        // Assert: the list is loading again, and the form outlived it
        expect(wrapper.find('[role="status"]').text()).toBe('Loading...');
        expect(wrapper.find(addForm).exists()).toBe(true);
        expect(wrapper.find<HTMLInputElement>('#business-registered_name').element.value).toBe('Studio de Vries');

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should keep the form behind Add a business when listBusinesses gets a 200 (ok) with businesses, and close it again on Cancel', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        const wrapper = await mountBusinesses();
        await flushPromises();

        // Assert: closed at first
        expect(wrapper.find(addForm).exists()).toBe(false);

        // Act
        await buttonNamed(wrapper, 'Add a business')?.trigger('click');

        // Assert: open, with a way back, and the list stays above it
        expect(wrapper.find(addForm).exists()).toBe(true);
        expect(wrapper.findAll('li')).toHaveLength(1);

        // Act
        await buttonNamed(wrapper, 'Cancel')?.trigger('click');

        // Assert
        expect(wrapper.find(addForm).exists()).toBe(false);
        expect(buttonNamed(wrapper, 'Add a business')).toBeDefined();
    });

    it('should create the business from the typed fields with country_code NL and open its dashboard when createBusiness gets a 201 (created)', async () =>
    {
        // Arrange: the store reloads the list after the write, so a second answer holds the new business
        vi.mocked(service.listBusinesses)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([shop]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const { wrapper, router } = await mountBusinessesWithRouter();
        await flushPromises();
        await fillForm(wrapper);

        // Act
        await wrapper.find(addForm).trigger('submit');

        // Assert (outcome): on the new business's dashboard. waitFor retries,
        // because the dashboard route lazy-loads its page before the push resolves
        await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/businesses/3'));

        // Assert (interaction): the flat payload, toStrictEqual so 30 must be
        // a number: the backend's integer:strict rejects "30"
        expect(service.createBusiness).toHaveBeenCalledOnce();
        expect(vi.mocked(service.createBusiness).mock.calls[0]?.[0]).toStrictEqual(expectedPayload);
    });

    it('should not show Couldn\'t save. when createBusiness gets a 201 (created) but the navigation to the dashboard fails, and hand that failure on', async () =>
    {
        // Arrange: the push rejects, the way it does when the dashboard's
        // lazy chunk fails to load. errorHandler is a spy standing in for
        // app.config.errorHandler
        const failure = new Error('Failed to fetch dynamically imported module');
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([]).mockResolvedValueOnce([shop]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper, router } = await mountBusinessesWithRouter(errorHandler);
        await flushPromises();
        vi.spyOn(router, 'push').mockRejectedValue(failure);
        await fillForm(wrapper);

        // Act
        await wrapper.find(addForm).trigger('submit');
        await flushPromises();

        // Assert: the business was created and the push tried, so the form
        // doesn't claim the save failed; the failure still reaches Vue
        expect(router.push).toHaveBeenCalledOnce();
        expect(wrapper.find(`${addForm} [role="status"]`).text()).toBe('');
        expect(errorHandler).toHaveBeenCalledWith(failure, expect.anything(), expect.anything());
    });

    it('should send a typed payment term as a number, not the input\'s text', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const wrapper = await mountBusinesses();
        await flushPromises();
        await fillForm(wrapper);

        // Act: an input always holds text, so this is "14" until v-model converts it
        await wrapper.find('#business-payment_term_days').setValue('14');
        await wrapper.find(addForm).trigger('submit');
        await flushPromises();

        // Assert
        expect(vi.mocked(service.createBusiness).mock.calls[0]?.[0].payment_term_days).toBe(14);
    });

    it('should send an emptied payment term as null, not the input\'s empty text', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const wrapper = await mountBusinesses();
        await flushPromises();
        await fillForm(wrapper);

        // Act: the user clears the default 30
        await wrapper.find('#business-payment_term_days').setValue('');
        await wrapper.find(addForm).trigger('submit');
        await flushPromises();

        // Assert: null, so the backend's required rule answers it
        expect(vi.mocked(service.createBusiness).mock.calls[0]?.[0].payment_term_days).toBeNull();
    });

    it('should load the list again, not show the old failure, when the reload after createBusiness fails with a 500 (server error) after a failed first load was recovered by a visible tab', async () =>
    {
        // Arrange: the first load fails; the reload on a visible tab brings the
        // list; the reload after the create fails, which empties the store;
        // the page's own load after that brings the list with the new business
        vi.mocked(service.listBusinesses)
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakery])
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakery, shop]);
        vi.mocked(service.createBusiness).mockResolvedValue(shop);
        const wrapper = await mountBusinesses(() =>
        {});
        await flushPromises();
        setVisibility('visible');
        await flushPromises();
        await buttonNamed(wrapper, 'Add a business')?.trigger('click');
        await fillForm(wrapper);

        // Act
        await wrapper.find(addForm).trigger('submit');
        await flushPromises();

        // Assert (interaction): asked a fourth time, by the page itself
        expect(service.listBusinesses).toHaveBeenCalledTimes(4);

        // Assert (outcome): the new list, and no failure from before the visible tab
        expect(wrapper.findAll('li').map((item) => item.text())).toStrictEqual([
            'Bakkerij de Vries (KvK 12345671)',
            'Winkel de Vries (KvK 12345673)',
        ]);
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    // One row for a field of the page, one for a field inside AddressFields:
    // both read the same useForm errors.
    it.for([
        { name: 'kvk_number', field: 'kvk_number', message: 'The kvk number field must be 8 digits.' },
        { name: 'postal_code', field: 'postal_code', message: 'The postal code field format is invalid.' },
    ])('should show the error under its input, link it and stay on the page when createBusiness fails with a 422 (unprocessable): $name', async ({ field, message }) =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([]);
        vi.mocked(service.createBusiness).mockRejectedValue(axiosErrorWith(422, { message, errors: { [field]: [message] } }));
        const { wrapper, router } = await mountBusinessesWithRouter();
        await flushPromises();
        const push = vi.spyOn(router, 'push');
        await fillForm(wrapper);

        // Act
        await wrapper.find(addForm).trigger('submit');
        await flushPromises();

        // Assert: the error is shown, and its input points at it
        const input = wrapper.find(`#business-${field}`);
        expect(wrapper.find(`#business-${field}-error`).text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe(`business-${field}-error`);

        // Assert: shown once, by the field, not again in the status region
        expect(wrapper.find(`${addForm} [role="status"]`).text()).toBe('');

        // Assert (interaction): no navigation was started
        expect(push).not.toHaveBeenCalled();
    });

    it('should show the message in the status region when createBusiness fails with a 422 (unprocessable) on country_code, which has no input', async () =>
    {
        // Arrange
        const message = 'A business must be registered in the Netherlands.';
        vi.mocked(service.listBusinesses).mockResolvedValue([]);
        vi.mocked(service.createBusiness).mockRejectedValue(axiosErrorWith(422, { message, errors: { country_code: [message] } }));
        const wrapper = await mountBusinesses();
        await flushPromises();
        await fillForm(wrapper);

        // Act
        await wrapper.find(addForm).trigger('submit');
        await flushPromises();

        // Assert: without it the user would see no feedback at all
        expect(wrapper.find(`${addForm} [role="status"]`).text()).toBe(message);
    });
});
