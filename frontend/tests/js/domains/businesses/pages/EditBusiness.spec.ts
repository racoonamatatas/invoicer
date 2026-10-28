import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import EditBusiness from '@/domains/businesses/pages/EditBusiness.vue';
import * as service from '@/services/businesses';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { createDeferred } from '../../../utility/createDeferred';
import { createTestRouter } from '../../../utility/createTestRouter';

// Every export of both services becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');
vi.mock('@/services/businesses');

// Unmounts every page after each test, so no page left mounted keeps
// reacting to the next test's store.
enableAutoUnmount(afterEach);

const bakery = business(1, 'Bakkerij de Vries');
const studio = business(2, 'Studio de Vries');

const detailsForm = 'form[aria-label="Business details"]';

// Mounts EditBusiness on /businesses/<businessId>/edit with a fresh
// Pinia, a logged-in user (the store loads nothing without one) and the app's
// real routes. An empty store, the way a direct page load starts.
const mountEditBusiness = async (businessId: string, errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(`/businesses/${businessId}/edit`);

    const wrapper = mount(EditBusiness, { global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router };
};

type Wrapper = Awaited<ReturnType<typeof mountEditBusiness>>['wrapper'];

// The value of the input with this id, read the way the user sees it.
const valueOf = (wrapper: Wrapper, id: string) => wrapper.get<HTMLInputElement>(`#${id}`).element.value;

describe('EditBusiness page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should fill the form with the business in the URL from listBusinesses\'s 200 (ok), the addition\'s null as an empty input', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);

        // Act
        const { wrapper } = await mountEditBusiness('2');
        await flushPromises();

        // Assert: this business, not the first in the list
        expect(wrapper.find('h1').text()).toBe('Edit Studio de Vries');
        expect(valueOf(wrapper, 'business-registered_name')).toBe('Studio de Vries');
        expect(valueOf(wrapper, 'business-kvk_number')).toBe('12345672');
        expect(valueOf(wrapper, 'business-vat_number')).toBe('NL123456789B01');
        expect(valueOf(wrapper, 'business-street')).toBe('Keizersgracht');
        expect(valueOf(wrapper, 'business-house_number')).toBe('123');
        expect(valueOf(wrapper, 'business-house_number_addition')).toBe('');
        expect(valueOf(wrapper, 'business-postal_code')).toBe('1015 CJ');
        expect(valueOf(wrapper, 'business-city')).toBe('Amsterdam');
        expect(valueOf(wrapper, 'business-payment_term_days')).toBe('30');
    });

    it('should not render the form while listBusinesses is in flight, so no empty inputs flash before they fill', async () =>
    {
        // Arrange: listBusinesses is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(request.promise.then(() => [bakery]));

        // Act
        const { wrapper } = await mountEditBusiness('1');

        // Assert
        expect(wrapper.find('[role="status"]').text()).toBe('Loading...');
        expect(wrapper.find(detailsForm).exists()).toBe(false);

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should ask listBusinesses once and never fetchBusiness on a direct page load, since the list holds every business', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountEditBusiness('1');
        await flushPromises();

        // Assert: the form proves the answer was rendered before counting calls
        expect(wrapper.find(detailsForm).exists()).toBe(true);
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(service.fetchBusiness).not.toHaveBeenCalled();
    });

    it('should call updateBusiness with the id and the whole payload on save, show Saved. in the status region, stay on the page and show the new name from the reloaded list', async () =>
    {
        // Arrange: the second listBusinesses is the store's reload after the write
        const renamed = { ...bakery, registered_name: 'Bakkerij Jansen' };
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([bakery]).mockResolvedValueOnce([renamed]);
        vi.mocked(service.updateBusiness).mockResolvedValue(renamed);
        const { wrapper, router } = await mountEditBusiness('1');
        await flushPromises();
        const push = vi.spyOn(router, 'push');
        await wrapper.find('#business-registered_name').setValue('Bakkerij Jansen');

        // Act
        await wrapper.find(detailsForm).trigger('submit');
        await flushPromises();

        // Assert (interaction): every field is sent, the unchanged ones too,
        // since the endpoint is a PUT that replaces them all
        expect(service.updateBusiness).toHaveBeenCalledExactlyOnceWith(1, {
            registered_name: 'Bakkerij Jansen',
            kvk_number: '12345671',
            vat_number: 'NL123456789B01',
            street: 'Keizersgracht',
            house_number: '123',
            house_number_addition: '',
            postal_code: '1015 CJ',
            city: 'Amsterdam',
            country_code: 'NL',
            payment_term_days: 30,
        });

        // Assert (outcome): confirmed, still here, and the heading reads the store
        expect(wrapper.find(`${detailsForm} [role="status"]`).text()).toBe('Saved.');
        expect(push).not.toHaveBeenCalled();
        expect(wrapper.find('h1').text()).toBe('Edit Bakkerij Jansen');
    });

    it('should show the error under the KvK number input and no Saved. when updateBusiness fails with a 422 (unprocessable) on kvk_number', async () =>
    {
        // Arrange
        const message = 'The kvk number field must be 8 digits.';
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(service.updateBusiness).mockRejectedValue(axiosErrorWith(422, { message, errors: { kvk_number: [message] } }));
        const { wrapper } = await mountEditBusiness('1');
        await flushPromises();

        // Act
        await wrapper.find(detailsForm).trigger('submit');
        await flushPromises();

        // Assert: the error is shown, and its input points at it
        const input = wrapper.find('#business-kvk_number');
        expect(wrapper.find('#business-kvk_number-error').text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('business-kvk_number-error');

        // Assert: shown by the field, and the save isn't claimed
        expect(wrapper.find(`${detailsForm} [role="status"]`).text()).toBe('');
    });

    it('should keep the form and what was typed after saving when the list reload after the save fails with a 500 (server error)', async () =>
    {
        // Arrange: the first list loads the page; every later one fails, the
        // store's reload after the write and the page's own retry of it.
        // errorHandler is a spy standing in for app.config.errorHandler,
        // which receives that failure
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([bakery]).mockRejectedValue(axiosErrorWith(500, {}));
        vi.mocked(service.updateBusiness).mockResolvedValue(bakery);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper } = await mountEditBusiness('1', errorHandler);
        await flushPromises();

        // Act: the save and its failed reload settle before the user types on
        await wrapper.find(detailsForm).trigger('submit');
        await flushPromises();
        await wrapper.find('#business-city').setValue('Utrecht');

        // Assert: the failure is shown, as the page's own load error
        expect(wrapper.find('[role="status"]').text()).toBe('Couldn\'t load your businesses.');
        expect(errorHandler).toHaveBeenCalled();

        // Assert: the form is still there, with what was typed after the save
        expect(wrapper.find(detailsForm).exists()).toBe(true);
        expect(valueOf(wrapper, 'business-city')).toBe('Utrecht');
    });

    it('should keep Saved. in the form when the list reload after the save fails with a 500 (server error), since the save itself went through', async () =>
    {
        // Arrange: as above, without an edit after the save
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([bakery]).mockRejectedValue(axiosErrorWith(500, {}));
        vi.mocked(service.updateBusiness).mockResolvedValue(bakery);
        const { wrapper } = await mountEditBusiness('1', vi.fn());
        await flushPromises();

        // Act
        await wrapper.find(detailsForm).trigger('submit');
        await flushPromises();

        // Assert: the reload failed, and the save is still reported
        expect(service.listBusinesses).toHaveBeenCalledTimes(3);
        expect(wrapper.find(`${detailsForm} [role="status"]`).text()).toBe('Saved.');
    });

    it('should clear Saved. as soon as a field changes again, since the new value isn\'t saved', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(service.updateBusiness).mockResolvedValue(bakery);
        const { wrapper } = await mountEditBusiness('1');
        await flushPromises();
        await wrapper.find(detailsForm).trigger('submit');
        await flushPromises();
        expect(wrapper.find(`${detailsForm} [role="status"]`).text()).toBe('Saved.');

        // Act
        await wrapper.find('#business-city').setValue('Utrecht');

        // Assert
        expect(wrapper.find(`${detailsForm} [role="status"]`).text()).toBe('');
    });

    it('should show Couldn\'t save. in the form and hand the error on when updateBusiness fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, {});
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(service.updateBusiness).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper } = await mountEditBusiness('1', errorHandler);
        await flushPromises();

        // Act
        await wrapper.find(detailsForm).trigger('submit');
        await flushPromises();

        // Assert: the user sees it, and Vue's error handler gets the original
        expect(wrapper.find(`${detailsForm} [role="status"]`).text()).toBe('Couldn\'t save.');
        expect(errorHandler).toHaveBeenCalledWith(error, expect.anything(), expect.anything());
    });

    it('should show the business as stored in the inputs after a save, not as typed, when updateBusiness gets a 200 (ok) with normalised values', async () =>
    {
        // Arrange: the backend stores the postcode in its canonical form
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(service.updateBusiness).mockResolvedValue({ ...bakery, postal_code: '1015 CJ' });
        const { wrapper } = await mountEditBusiness('1');
        await flushPromises();
        await wrapper.find('#business-postal_code').setValue('1015cj');

        // Act
        await wrapper.find(detailsForm).trigger('submit');
        await flushPromises();

        // Assert: what was sent, and what the input shows now
        expect(vi.mocked(service.updateBusiness).mock.calls[0]?.[1].postal_code).toBe('1015cj');
        expect(valueOf(wrapper, 'business-postal_code')).toBe('1015 CJ');
        expect(wrapper.find(`${detailsForm} [role="status"]`).text()).toBe('Saved.');
    });

    it('should show Saved. again when an edit after the save is undone, since the inputs hold what was stored again', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(service.updateBusiness).mockResolvedValue(bakery);
        const { wrapper } = await mountEditBusiness('1');
        await flushPromises();
        await wrapper.find(detailsForm).trigger('submit');
        await flushPromises();
        await wrapper.find('#business-city').setValue('Utrecht');

        // Act
        await wrapper.find('#business-city').setValue('Amsterdam');

        // Assert
        expect(wrapper.find(`${detailsForm} [role="status"]`).text()).toBe('Saved.');
    });

    it('should not show the previous business\'s form when the URL changes to another id while the list is failed, so a save can\'t write to the wrong business', async () =>
    {
        // Arrange: business 1 loads, then a save's reload fails and every
        // later list request fails too, so the page keeps business 1 only
        // as its last found. vi.fn() takes the handed-on load failures
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([bakery, studio]).mockRejectedValue(axiosErrorWith(500, {}));
        vi.mocked(service.updateBusiness).mockResolvedValue(bakery);
        const { wrapper, router } = await mountEditBusiness('1', vi.fn());
        await flushPromises();
        await wrapper.find(detailsForm).trigger('submit');
        await flushPromises();
        expect(wrapper.find(detailsForm).exists()).toBe(true);

        // Act: the page stays mounted while only the param changes, the way
        // Vue Router reuses a page between two URLs of the same route
        await router.push('/businesses/2/edit');
        await flushPromises();

        // Assert: the failure, and no form or heading of business 1
        expect(wrapper.find('[role="status"]').text()).toBe('Couldn\'t load your businesses.');
        expect(wrapper.find(detailsForm).exists()).toBe(false);
        expect(wrapper.find('h1').exists()).toBe(false);
    });

    it('should show not found and no form when listBusinesses gets a 200 (ok) without the id in the URL', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountEditBusiness('99');
        await flushPromises();

        // Assert
        expect(wrapper.find('h1').text()).toBe('Business not found');
        expect(wrapper.find(detailsForm).exists()).toBe(false);
    });
});
