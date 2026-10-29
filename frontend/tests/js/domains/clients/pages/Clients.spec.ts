import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import Clients from '@/domains/clients/pages/Clients.vue';
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

describe('Clients page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
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
});
