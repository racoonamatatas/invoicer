import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { NavigationGuardWithThis } from 'vue-router';

import Landing from '@/domains/businesses/pages/Landing.vue';
import { useBusinessesStore } from '@/domains/businesses/store';
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
// tell which one the page used. guard, when given, runs on every navigation
// after the one to /, so a test can stop the page's redirect.
const mountLanding = async (errorHandler?: (error: unknown) => void, guard?: NavigationGuardWithThis<undefined>) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push({ name: 'home' });

    if (guard !== undefined)
    {
        router.beforeEach(guard);
    }
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

    it('should replace / without a failure when the store already holds the list, so the redirect starts during setup', async () =>
    {
        // Arrange: the list is loaded before Landing mounts, the way it is
        // when the user comes back to / from another page. The watcher's
        // immediate run then calls replace while setup is still running
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);
        const pinia = createPinia();
        setActivePinia(pinia);
        await logInAs(jan);
        await useBusinessesStore().load();
        const router = createTestRouter();
        await router.push({ name: 'home' });

        // Act
        const wrapper = mount(Landing, { global: { plugins: [pinia, router] } });

        // Assert: the redirect landed, and the page never thought it failed
        await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/businesses'));
        expect(wrapper.find('[role="status"]').text()).toBe('Loading...');
        expect(service.listBusinesses).toHaveBeenCalledOnce();
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

    it('should offer Log out next to Try again when listBusinesses fails with a 500 (server error), so the user isn\'t stuck on /', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockRejectedValue(axiosErrorWith(500, { message: 'Server Error' }));

        // Act
        const { wrapper } = await mountLanding(() =>
        {});
        await flushPromises();

        // Assert
        expect(wrapper.findAll('button').map((button) => button.text())).toEqual(['Try again', 'Log out']);
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

    it('should offer the list and Log out instead of Loading... when a guard stops the redirect after listBusinesses gets a 200 (ok)', async () =>
    {
        // Arrange: a guard that returns false aborts the navigation, so
        // replace resolves with a failure instead of throwing
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);

        // Act
        const { wrapper, router } = await mountLanding(undefined, () => false);
        await flushPromises();

        // Assert: still on /, with a way on and a way out
        expect(router.currentRoute.value.path).toBe('/');
        expect(wrapper.find('[role="status"]').text()).toBe('Couldn\'t open your page.');
        const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'Your businesses');
        expect(link?.attributes('href')).toBe('/businesses');
        expect(wrapper.findAll('button').map((button) => button.text())).toStrictEqual(['Log out']);
    });

    it('should offer the list and hand the error on when the redirect throws after listBusinesses gets a 200 (ok)', async () =>
    {
        // Arrange: a guard that throws stands in for any navigation error,
        // such as a page chunk that fails to load
        const error = new Error('Failed to fetch dynamically imported module');
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { wrapper } = await mountLanding(errorHandler, () =>
        {
            throw error;
        });
        await flushPromises();

        // Assert (outcome)
        expect(wrapper.find('[role="status"]').text()).toBe('Couldn\'t open your page.');

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);
    });
});
