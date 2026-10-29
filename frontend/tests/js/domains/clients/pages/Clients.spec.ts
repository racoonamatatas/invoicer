import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import Clients from '@/domains/clients/pages/Clients.vue';
import * as service from '@/services/businesses';
import * as clientsService from '@/services/clients';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { business, jan, logInAs } from '../../../utility/businesses';
import { dutchClient, germanClient } from '../../../utility/clients';
import { createDeferred } from '../../../utility/createDeferred';
import { createTestRouter } from '../../../utility/createTestRouter';

// Every export of the three services becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');
vi.mock('@/services/businesses');
vi.mock('@/services/clients');

const bakery = business(1, 'Bakkerij de Vries');
const studio = business(2, 'Studio de Vries');

const bakker = dutchClient(3, 'Fietsenmakerij Bakker');
const huber = germanClient(4, 'Brauerei Huber');

// Mounts Clients on /businesses/<businessId>/clients with a fresh Pinia, a
// logged-in user (the store loads nothing without one) and the app's real
// routes, so its RouterLinks resolve.
const mountClients = async (businessId: string, errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(`/businesses/${businessId}/clients`);

    const wrapper = mount(Clients, { global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router };
};

// Each listed client's text, as a user reads the row.
const listedClients = (wrapper: VueWrapper): string[] =>
    wrapper.findAll('ul[aria-label="Clients"] li').map((row) => row.text());

describe('Clients page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
        // An empty list by default, so a test about the business states needn't
        // know the page also loads its clients.
        vi.mocked(clientsService.listClients).mockResolvedValue([]);
    });

    it('should show Clients · and the registered name of the business in the URL when listBusinesses gets a 200 (ok) that has it', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);

        // Act
        const { wrapper } = await mountClients('2');
        await flushPromises();

        // Assert: this business, not the first in the list
        expect(wrapper.find('h1').text()).toBe('Clients · Studio de Vries');
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    it('should show Loading... in the status region while listBusinesses is in flight', async () =>
    {
        // Arrange: listBusinesses is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(request.promise.then(() => [bakery]));

        // Act
        const { wrapper } = await mountClients('1');

        // Assert: no heading yet, so no name and no not-found flashes by
        expect(wrapper.find('[role="status"]').text()).toBe('Loading...');
        expect(wrapper.find('h1').exists()).toBe(false);

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should show not found when listBusinesses gets a 200 (ok) without the id in the URL', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountClients('99');
        await flushPromises();

        // Assert: the request was answered, and the page says what it means
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(wrapper.find('h1').text()).toBe('Business not found');
    });

    it('should show the failure with a Try again button and hand the error on when listBusinesses fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { wrapper } = await mountClients('1', errorHandler);
        await flushPromises();

        // Assert (outcome): the user is told, and can retry
        expect(wrapper.find('[role="status"]').text()).toBe('Couldn\'t load your businesses.');
        expect(wrapper.findAll('button').some((button) => button.text() === 'Try again')).toBe(true);

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledExactlyOnceWith(error, expect.anything(), expect.anything());
    });

    it('should link back to its dashboard and to /businesses and offer Log out when the business is found', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountClients('1');
        await flushPromises();

        // Assert: found by their text the way a user finds them
        const hrefOf = (text: string) => wrapper.findAll('a').find((anchor) => anchor.text() === text)?.attributes('href');
        expect(hrefOf('Back to the dashboard')).toBe('/businesses/1');
        expect(hrefOf('Your businesses')).toBe('/businesses');
        expect(wrapper.findAll('button').map((button) => button.text())).toContain('Log out');
    });

    it('should list each client\'s name, city and country name when listClients gets a 200 (ok)', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(clientsService.listClients).mockResolvedValue([huber, bakker]);

        // Act
        const { wrapper } = await mountClients('1');
        await flushPromises();

        // Assert: the country by name, not code; the server's order kept
        expect(clientsService.listClients).toHaveBeenCalledExactlyOnceWith(1);
        expect(listedClients(wrapper)).toStrictEqual([
            'Brauerei Huber, München, Germany',
            'Fietsenmakerij Bakker, Groningen, Netherlands',
        ]);
        expect(wrapper.find('#clients-status').text()).toBe('');
    });

    it('should say there are no clients yet when listClients gets a 200 (ok) with an empty list', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountClients('1');
        await flushPromises();

        // Assert
        expect(wrapper.text()).toContain('No clients yet.');
        expect(wrapper.find('ul[aria-label="Clients"]').exists()).toBe(false);
    });

    it('should show Loading clients... in the clients\' status region while listClients is in flight', async () =>
    {
        // Arrange: listClients is a stub whose request the test finishes by hand
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        const request = createDeferred();
        vi.mocked(clientsService.listClients).mockReturnValue(request.promise.then(() => [bakker]));

        // Act
        const { wrapper } = await mountClients('1');
        await flushPromises();

        // Assert: the business is found, its clients aren't in yet
        expect(wrapper.find('h1').text()).toBe('Clients · Bakkerij de Vries');
        expect(wrapper.find('#clients-status').text()).toBe('Loading clients...');
        expect(wrapper.find('ul[aria-label="Clients"]').exists()).toBe(false);
        expect(wrapper.text()).not.toContain('No clients yet.');

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should show the failure with a Try again button beside it and hand the error on when listClients fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(clientsService.listClients).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { wrapper } = await mountClients('1', errorHandler);
        await flushPromises();

        // Assert (outcome): the user is told, and can retry from right there: the button shares the message's line
        const status = wrapper.find('#clients-status');
        expect(status.text()).toBe('Couldn\'t load the clients.');
        const retry = wrapper.findAll('button').find((button) => button.text() === 'Try again');
        expect(retry?.element.parentElement).toBe(status.element.parentElement);

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledExactlyOnceWith(error, expect.anything(), expect.anything());
    });

    it('should show the list after Try again when listClients first fails with a 500 (server error) and then gets a 200 (ok)', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(clientsService.listClients)
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakker]);
        const { wrapper } = await mountClients('1', () => undefined);
        await flushPromises();

        // Act
        const retry = wrapper.findAll('button').find((button) => button.text() === 'Try again');
        await retry?.trigger('click');
        await flushPromises();

        // Assert
        expect(clientsService.listClients).toHaveBeenCalledTimes(2);
        expect(listedClients(wrapper)).toStrictEqual(['Fietsenmakerij Bakker, Groningen, Netherlands']);
        expect(wrapper.find('#clients-status').text()).toBe('');
    });

    it('should show not found without calling listClients when listBusinesses gets a 200 (ok) without the id in the URL', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountClients('99');
        await flushPromises();

        // Assert: the business list was answered, and no client request followed it
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(wrapper.find('h1').text()).toBe('Business not found');
        expect(clientsService.listClients).not.toHaveBeenCalled();
    });
});
