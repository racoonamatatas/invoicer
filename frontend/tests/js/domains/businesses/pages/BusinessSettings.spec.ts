import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import BusinessSettings from '@/domains/businesses/pages/BusinessSettings.vue';
import * as service from '@/services/businesses';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { createDeferred } from '../../../utility/createDeferred';
import { createTestRouter } from '../../../utility/createTestRouter';

// Every export of both services becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');
vi.mock('@/services/businesses');

const bakery = business(1, 'Bakkerij de Vries');
const studio = business(2, 'Studio de Vries');

const settingsForm = 'form[aria-label="Business settings"]';

// Mounts BusinessSettings on /businesses/<businessId>/settings with a fresh
// Pinia, a logged-in user (the store loads nothing without one) and the app's
// real routes. An empty store, the way a direct page load starts.
const mountBusinessSettings = async (businessId: string) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(`/businesses/${businessId}/settings`);

    const wrapper = mount(BusinessSettings, { global: { plugins: [pinia, router] } });

    return { wrapper, router };
};

type Wrapper = Awaited<ReturnType<typeof mountBusinessSettings>>['wrapper'];

// The value of the input with this id, read the way the user sees it.
const valueOf = (wrapper: Wrapper, id: string) => wrapper.get<HTMLInputElement>(`#${id}`).element.value;

describe('BusinessSettings page', () =>
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
        const { wrapper } = await mountBusinessSettings('2');
        await flushPromises();

        // Assert: this business, not the first in the list
        expect(wrapper.find('h1').text()).toBe('Settings for Studio de Vries');
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
        const { wrapper } = await mountBusinessSettings('1');

        // Assert
        expect(wrapper.find('[role="status"]').text()).toBe('Loading...');
        expect(wrapper.find(settingsForm).exists()).toBe(false);

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should ask listBusinesses once and never fetchBusiness on a direct page load, since the list holds every business', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountBusinessSettings('1');
        await flushPromises();

        // Assert: the form proves the answer was rendered before counting calls
        expect(wrapper.find(settingsForm).exists()).toBe(true);
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(service.fetchBusiness).not.toHaveBeenCalled();
    });

    it('should call updateBusiness with the id and the whole payload on save, show Saved. in the status region, stay on the page and show the new name from the reloaded list', async () =>
    {
        // Arrange: the second listBusinesses is the store's reload after the write
        const renamed = { ...bakery, registered_name: 'Bakkerij Jansen' };
        vi.mocked(service.listBusinesses).mockResolvedValueOnce([bakery]).mockResolvedValueOnce([renamed]);
        vi.mocked(service.updateBusiness).mockResolvedValue(renamed);
        const { wrapper, router } = await mountBusinessSettings('1');
        await flushPromises();
        const push = vi.spyOn(router, 'push');
        await wrapper.find('#business-registered_name').setValue('Bakkerij Jansen');

        // Act
        await wrapper.find(settingsForm).trigger('submit');
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
        expect(wrapper.find(`${settingsForm} [role="status"]`).text()).toBe('Saved.');
        expect(push).not.toHaveBeenCalled();
        expect(wrapper.find('h1').text()).toBe('Settings for Bakkerij Jansen');
    });

    it('should show the error under the KvK number input and no Saved. when updateBusiness fails with a 422 (unprocessable) on kvk_number', async () =>
    {
        // Arrange
        const message = 'The kvk number field must be 8 digits.';
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(service.updateBusiness).mockRejectedValue(axiosErrorWith(422, { message, errors: { kvk_number: [message] } }));
        const { wrapper } = await mountBusinessSettings('1');
        await flushPromises();

        // Act
        await wrapper.find(settingsForm).trigger('submit');
        await flushPromises();

        // Assert: the error is shown, and its input points at it
        const input = wrapper.find('#business-kvk_number');
        expect(wrapper.find('#business-kvk_number-error').text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('business-kvk_number-error');

        // Assert: shown by the field, and the save isn't claimed
        expect(wrapper.find(`${settingsForm} [role="status"]`).text()).toBe('');
    });

    it('should show not found and no form when listBusinesses gets a 200 (ok) without the id in the URL', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountBusinessSettings('99');
        await flushPromises();

        // Assert
        expect(wrapper.find('h1').text()).toBe('Business not found');
        expect(wrapper.find(settingsForm).exists()).toBe(false);
    });
});
