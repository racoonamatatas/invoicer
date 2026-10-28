import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import Landing from '@/domains/businesses/pages/Landing.vue';
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

// Mounts Landing on / with a fresh Pinia, a logged-in user and the app's
// real routes. replace and push are spies that still navigate, so a test can
// tell which one the page used.
const mountLanding = async (errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push({ name: 'home' });
    const replace = vi.spyOn(router, 'replace');
    const push = vi.spyOn(router, 'push');

    const wrapper = mount(Landing, { global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router, replace, push };
};

describe('Landing page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    // One row per count the rule tells apart: none, exactly one, more than one.
    it.for([
        { name: '0 businesses', list: [], route: { name: 'businesses' }, path: '/businesses' },
        { name: '1 business', list: [studio], route: { name: 'dashboard', params: { businessId: 2 } }, path: '/businesses/2' },
        { name: '2 businesses', list: [bakery, studio], route: { name: 'businesses' }, path: '/businesses' },
    ])('should replace / with the right page when listBusinesses gets a 200 (ok): $name', async ({ list, route, path }) =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue(list);

        // Act
        const { router, replace, push } = await mountLanding();

        // Assert (outcome): waitFor retries, because the target route
        // lazy-loads its page before the navigation resolves
        await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(path));

        // Assert (interaction): replaced, not pushed, so Back skips /
        expect(replace).toHaveBeenCalledExactlyOnceWith(route);
        expect(push).not.toHaveBeenCalled();
    });

    it('should show Loading... in the status region and stay on / while listBusinesses is in flight', async () =>
    {
        // Arrange: listBusinesses is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(request.promise.then(() => [bakery]));

        // Act
        const { wrapper, replace } = await mountLanding();

        // Assert
        expect(wrapper.find('[role="status"]').text()).toBe('Loading...');
        expect(replace).not.toHaveBeenCalled();

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should show the failure with a Try again button, stay on / and hand the error on when listBusinesses fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { wrapper, replace } = await mountLanding(errorHandler);
        await flushPromises();

        // Assert (outcome): not a blank page, and a way forward
        expect(wrapper.find('[role="status"]').text()).toBe('Couldn\'t load your businesses.');
        expect(wrapper.find('button').text()).toBe('Try again');
        expect(replace).not.toHaveBeenCalled();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);
    });

    it('should go on to the dashboard when Try again gets a 200 (ok) with one business after a failed load', async () =>
    {
        // Arrange: the first request fails, the retry succeeds
        vi.mocked(service.listBusinesses)
            .mockRejectedValueOnce(axiosErrorWith(500, { message: 'Server Error' }))
            .mockResolvedValueOnce([bakery]);
        const { wrapper, router } = await mountLanding(() =>
        {});
        await flushPromises();

        // Act
        await wrapper.find('button').trigger('click');

        // Assert
        await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/businesses/1'));
    });
});
