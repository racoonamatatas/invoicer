import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import EditClient from '@/domains/clients/pages/EditClient.vue';
import * as service from '@/services/businesses';
import * as clientsService from '@/services/clients';
import type { Client } from '@/services/clients';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { dutchClient, germanClient } from '../../../utility/clients';
import { createTestRouter } from '../../../utility/createTestRouter';

// Every export of the auth and businesses services becomes a vi.fn(), so no
// request leaves the test. Of the clients service only the request functions:
// ClientNotFoundError stays real, since the page tells it apart with
// instanceof.
vi.mock('@/services/auth');
vi.mock('@/services/businesses');
vi.mock('@/services/clients', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/clients')>(),
    fetchClient: vi.fn<typeof clientsService.fetchClient>(),
    updateClient: vi.fn<typeof clientsService.updateClient>(),
}));

const bakery = business(1, 'Bakkerij de Vries');

const bakker = dutchClient(3, 'Fietsenmakerij Bakker');
const huber = germanClient(4, 'Brauerei Huber');

// Mounts EditClient on /businesses/<businessId>/clients/<clientId>/edit with a
// fresh Pinia, a logged-in user (the store loads nothing without one) and the
// app's real routes, so its RouterLinks resolve.
const mountEditClient = async (businessId: string, clientId: string, errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(`/businesses/${businessId}/clients/${clientId}/edit`);

    const wrapper = mount(EditClient, { global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router };
};

const form = (wrapper: VueWrapper) => wrapper.find('form[aria-label="Client details"]');

const formStatus = (wrapper: VueWrapper): string => form(wrapper).find('[role="status"]').text();

const inputValue = (wrapper: VueWrapper, id: string): string => (wrapper.find(`#${id}`).element as HTMLInputElement).value;

// Every value the form shows, by input id, so a test compares the whole form
// in one assertion.
const shownValues = (wrapper: VueWrapper): Record<string, string> => Object.fromEntries(
    ['name', 'email', 'vat_number', 'street', 'house_number', 'house_number_addition', 'postal_code', 'city', 'country_code']
        .map((field) => [field, inputValue(wrapper, `client-${field}`)]),
);

describe('EditClient page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
    });

    // A German client too: its address is the other half of the `Address`
    // union, with a region and its own postcode format
    it.for([
        {
            name: 'a Dutch client, with no VAT number',
            client: bakker,
            shown: { name: 'Fietsenmakerij Bakker', email: 'client3@example.nl', vat_number: '', street: 'Oosterstraat', house_number: '123', house_number_addition: '', postal_code: '9711 LM', city: 'Groningen', country_code: 'NL' },
            region: null,
        },
        {
            name: 'a German client',
            client: huber,
            shown: { name: 'Brauerei Huber', email: 'client4@example.de', vat_number: 'DE123456789', street: 'Leopoldstraße', house_number: '12', house_number_addition: '', postal_code: '80802', city: 'München', country_code: 'DE' },
            region: 'Bayern',
        },
    ])('should show Edit and the stored values, a null shown as an empty input, when fetchClient gets a 200 (ok): $name', async ({ client, shown, region }) =>
    {
        // Arrange
        vi.mocked(clientsService.fetchClient).mockResolvedValue(client);

        // Act
        const { wrapper } = await mountEditClient('1', String(client.id));
        await flushPromises();

        // Assert
        expect(clientsService.fetchClient).toHaveBeenCalledExactlyOnceWith(1, client.id);
        expect(wrapper.find('h1').text()).toBe(`Edit ${client.name}`);
        expect(shownValues(wrapper)).toStrictEqual(shown);

        // Assert: a Dutch address has no Region input at all
        const regionInput = wrapper.find('#client-region');
        expect(regionInput.exists() ? (regionInput.element as HTMLInputElement).value : null).toBe(region);
    });

    it('should put the payload without the id, say Saved. and show what the backend stored when updateClient gets a 200 (ok)', async () =>
    {
        // Arrange: the backend stores the postcode in its own format
        vi.mocked(clientsService.fetchClient).mockResolvedValue(bakker);
        const stored: Client = { ...bakker, name: 'Fietsenmakerij Bakker & Zn', postal_code: '9711 LM' };
        vi.mocked(clientsService.updateClient).mockResolvedValue(stored);
        const { wrapper } = await mountEditClient('1', '3');
        await flushPromises();

        // Act
        await wrapper.find('#client-name').setValue('Fietsenmakerij Bakker & Zn');
        await wrapper.find('#client-postal_code').setValue('9711lm');
        await form(wrapper).trigger('submit');
        await flushPromises();

        // Assert (interaction): every field, no id or other response-only key,
        // and the nulls the form showed as empty inputs sent as null again
        expect(clientsService.updateClient).toHaveBeenCalledExactlyOnceWith(1, 3, {
            name: 'Fietsenmakerij Bakker & Zn',
            email: 'client3@example.nl',
            vat_number: null,
            street: 'Oosterstraat',
            house_number: '123',
            house_number_addition: '',
            postal_code: '9711lm',
            city: 'Groningen',
            region: null,
            country_code: 'NL',
        });

        // Assert (outcome): the form and the heading show the stored client
        expect(formStatus(wrapper)).toBe('Saved.');
        expect(inputValue(wrapper, 'client-postal_code')).toBe('9711 LM');
        expect(wrapper.find('h1').text()).toBe('Edit Fietsenmakerij Bakker & Zn');
    });

    it('should show a 422 (unprocessable content) next to its input and keep what was typed', async () =>
    {
        // Arrange
        const message = 'The email field must be a valid email address.';
        vi.mocked(clientsService.fetchClient).mockResolvedValue(bakker);
        vi.mocked(clientsService.updateClient).mockRejectedValue(axiosErrorWith(422, {
            message,
            errors: { email: [message] },
        }));
        const { wrapper } = await mountEditClient('1', '3');
        await flushPromises();

        // Act: an address the browser's own check would let through
        await wrapper.find('#client-email').setValue('info@bakker');
        await form(wrapper).trigger('submit');
        await flushPromises();

        // Assert: the message is linked to its input, for a screen reader
        const input = wrapper.find('#client-email');
        expect(input.attributes('aria-invalid')).toBe('true');
        const describedBy = input.attributes('aria-describedby');
        expect(describedBy).toBeDefined();
        expect(wrapper.find(`#${describedBy}`).text()).toBe(message);

        expect(inputValue(wrapper, 'client-email')).toBe('info@bakker');
        expect(formStatus(wrapper)).toBe('');
    });

    it('should show Client not found naming the business, and no form, when fetchClient gets a 404 (not found)', async () =>
    {
        // Arrange
        vi.mocked(clientsService.fetchClient).mockRejectedValue(new clientsService.ClientNotFoundError(axiosErrorWith(404, { message: 'Not Found' })));

        // Act
        const { wrapper } = await mountEditClient('1', '99');
        await flushPromises();

        // Assert
        expect(wrapper.find('h1').text()).toBe('Client not found');
        expect(wrapper.text()).toContain('It doesn\'t exist, or it isn\'t a client of Bakkerij de Vries.');
        expect(form(wrapper).exists()).toBe(false);
    });

    it('should show Couldn\'t load the client. with a Try again button when fetchClient fails with a 500 (server error), and the form once Try again gets a 200 (ok)', async () =>
    {
        // Arrange: errorHandler is a stub, so the handed-on error doesn't fail the test
        vi.mocked(clientsService.fetchClient)
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce(bakker);
        const { wrapper } = await mountEditClient('1', '3', () =>
        {});
        await flushPromises();

        // Assert
        expect(wrapper.find('#client-status').text()).toBe('Couldn\'t load the client.');
        expect(form(wrapper).exists()).toBe(false);

        // Act
        const tryAgain = wrapper.findAll('button').find((button) => button.text() === 'Try again');
        await tryAgain?.trigger('click');
        await flushPromises();

        // Assert
        expect(wrapper.find('#client-status').text()).toBe('');
        expect(wrapper.find('h1').text()).toBe('Edit Fietsenmakerij Bakker');
    });

    it('should link back to the business\'s clients when the business is found', async () =>
    {
        // Arrange
        vi.mocked(clientsService.fetchClient).mockResolvedValue(bakker);

        // Act
        const { wrapper } = await mountEditClient('1', '3');
        await flushPromises();

        // Assert: found by its text the way a user finds it
        const back = wrapper.findAll('a').find((anchor) => anchor.text() === 'Back to the clients');
        expect(back?.attributes('href')).toBe('/businesses/1/clients');
    });
});
