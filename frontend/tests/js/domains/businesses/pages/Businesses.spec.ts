import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import Businesses from '@/domains/businesses/pages/Businesses.vue';
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

const bakery = business(1, 'Bakkerij de Vries');
const studio = business(2, 'Studio de Vries');

// Mounts Businesses on /businesses with a fresh Pinia, a logged-in user (the
// store loads nothing without one) and the app's real routes.
const mountBusinesses = async (errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push({ name: 'businesses' });

    return mount(Businesses, { global: { plugins: [pinia, router], config: { errorHandler } } });
};

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

    afterEach(() =>
    {
        vi.restoreAllMocks();
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

    it('should list the legal name and KvK number of each business when listBusinesses gets a 200 (ok)', async () =>
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

    it('should link each legal name to its business\'s dashboard', async () =>
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
        expect(wrapper.find('button').text()).toBe('Try again');

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
        await wrapper.find('button').trigger('click');
        await flushPromises();

        // Assert: the list replaced the failure, button included
        expect(wrapper.findAll('li').map((item) => item.text())).toStrictEqual(['Bakkerij de Vries (KvK 12345671)']);
        expect(wrapper.find('[role="status"]').text()).toBe('');
        expect(wrapper.find('button').exists()).toBe(false);
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
