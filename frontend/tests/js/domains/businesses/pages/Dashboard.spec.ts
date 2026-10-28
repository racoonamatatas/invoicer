import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import Dashboard from '@/domains/businesses/pages/Dashboard.vue';
import * as auth from '@/services/auth';
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

// Mounts Dashboard on /businesses/<businessId> with a fresh Pinia, a
// logged-in user (the store loads nothing without one) and the app's real
// routes, so its RouterLinks resolve. A string, so a test can put anything in
// the URL, the way a user can.
const mountDashboard = async (businessId: string, errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);
    await logInAs(jan);

    const router = createTestRouter();
    await router.push(`/businesses/${businessId}`);

    const wrapper = mount(Dashboard, { global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router };
};

// The log out button, found by its text the way a user finds it. Not
// find('button'): a failed load adds a Try again button.
const logoutButton = (wrapper: Awaited<ReturnType<typeof mountDashboard>>['wrapper']) =>
{
    const button = wrapper.findAll('button').find((candidate) => candidate.text() === 'Log out');

    if (button === undefined)
    {
        throw new Error('No Log out button');
    }

    return button;
};

describe('Dashboard page', () =>
{
    // assign is a spy (and a stub: it does nothing). jsdom can't do a real page
    // load, and won't let vi.spyOn redefine location.assign, so the whole
    // location is swapped for a copy with a spy in its place.
    const assign = vi.fn<(url: string | URL) => void>();

    beforeEach(() =>
    {
        vi.resetAllMocks();
        vi.stubGlobal('location', { ...window.location, assign });
    });

    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it('should show the legal name of the business in the URL when listBusinesses gets a 200 (ok) that has it', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery, studio]);

        // Act
        const { wrapper } = await mountDashboard('2');
        await flushPromises();

        // Assert: this business, not the first in the list
        expect(wrapper.find('h1').text()).toBe('Studio de Vries');
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    it('should show Loading... in the status region while listBusinesses is in flight', async () =>
    {
        // Arrange: listBusinesses is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(service.listBusinesses).mockReturnValue(request.promise.then(() => [bakery]));

        // Act
        const { wrapper } = await mountDashboard('1');

        // Assert: no heading yet, so no name and no not-found flashes by
        expect(wrapper.find('[role="status"]').text()).toBe('Loading...');
        expect(wrapper.find('h1').exists()).toBe(false);

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });

    it('should show not found when listBusinesses gets a 200 (ok) without the id in the URL, which covers both another user\'s business and an unknown one', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountDashboard('99');
        await flushPromises();

        // Assert: the request was answered, and the page says what it means
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(wrapper.find('h1').text()).toBe('Business not found');
    });

    // One row per kind of id that can't be a business id. 01 and 1e3 would
    // pass Number(); the long one is past what a number holds exactly.
    it.for([
        { name: 'letters', businessId: 'abc' },
        { name: 'zero', businessId: '0' },
        { name: 'negative', businessId: '-1' },
        { name: 'fraction', businessId: '1.5' },
        { name: 'leading zero', businessId: '01' },
        { name: 'exponent', businessId: '1e3' },
        { name: 'past Number.MAX_SAFE_INTEGER', businessId: '9007199254740993' },
    ])('should show not found without calling listBusinesses when the id in the URL is not a positive integer: $name', async ({ businessId }) =>
    {
        // Act
        const { wrapper } = await mountDashboard(businessId);
        await flushPromises();

        // Assert
        expect(wrapper.find('h1').text()).toBe('Business not found');
        expect(service.listBusinesses).not.toHaveBeenCalled();
    });

    it('should load and show the business when the URL changes from an id that can\'t exist to one in the list', async () =>
    {
        // Arrange: the page stays mounted while only the param changes, the
        // way Vue Router reuses a page between two URLs of the same route
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        const { wrapper, router } = await mountDashboard('abc');
        await flushPromises();

        // Act
        await router.push('/businesses/1');
        await flushPromises();

        // Assert
        expect(service.listBusinesses).toHaveBeenCalledOnce();
        expect(wrapper.find('h1').text()).toBe('Bakkerij de Vries');
    });

    it('should show the failure with a Try again button and hand the error on when listBusinesses fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();

        // Act
        const { wrapper } = await mountDashboard('1', errorHandler);
        await flushPromises();

        // Assert (outcome): the user is told, and can retry
        expect(wrapper.find('[role="status"]').text()).toBe('Couldn\'t load your businesses.');
        expect(wrapper.findAll('button').some((button) => button.text() === 'Try again')).toBe(true);

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledExactlyOnceWith(error, expect.anything(), expect.anything());
    });

    it('should link to /businesses and /change-password when the business is found', async () =>
    {
        // Arrange
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);

        // Act
        const { wrapper } = await mountDashboard('1');
        await flushPromises();

        // Assert: found by their text the way a user finds them
        const hrefOf = (text: string) => wrapper.findAll('a').find((anchor) => anchor.text() === text)?.attributes('href');
        expect(hrefOf('Your businesses')).toBe('/businesses');
        expect(hrefOf('Change password')).toBe('/change-password');
    });

    it('should link to /businesses when the business is not found, so the user has a way out', async () =>
    {
        // Act
        const { wrapper } = await mountDashboard('abc');
        await flushPromises();

        // Assert
        expect(wrapper.find('h1').text()).toBe('Business not found');
        const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'Your businesses');
        expect(link?.attributes('href')).toBe('/businesses');
    });

    it('should log out and do a full page load of /login when logout gets a 204 (no content)', async () =>
    {
        // Arrange: auth.logout is a stub (resolves, like a 204) and a spy (records its call)
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(auth.logout).mockResolvedValue();
        const { wrapper } = await mountDashboard('1');
        await flushPromises();

        // Act
        await logoutButton(wrapper).trigger('click');
        await flushPromises();

        // Assert (interaction): the backend was asked, then the browser was told to
        // load /login. Interaction asserts only: jsdom has no page load to observe
        expect(auth.logout).toHaveBeenCalledOnce();
        expect(assign).toHaveBeenCalledExactlyOnceWith('/login');
    });

    it('should hand the original error to the app error handler and not reload when logout fails with a 500 (server error)', async () =>
    {
        // Arrange: auth.logout is a stub that fails, so the session still exists.
        // errorHandler is a spy standing in for app.config.errorHandler, where Vue
        // sends a rejected promise returned by an event handler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(auth.logout).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper } = await mountDashboard('1', errorHandler);
        await flushPromises();

        // Act
        await logoutButton(wrapper).trigger('click');
        await flushPromises();

        // Assert (interaction): no reload, so the user stays on a page that still
        // matches the backend, where they are logged in
        expect(assign).not.toHaveBeenCalled();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): the button is usable again, so the user can retry
        expect(logoutButton(wrapper).attributes('disabled')).toBeUndefined();
    });

    it('should disable the log out button while logout is in flight', async () =>
    {
        // Arrange: auth.logout is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(service.listBusinesses).mockResolvedValue([bakery]);
        vi.mocked(auth.logout).mockReturnValue(request.promise);
        const { wrapper } = await mountDashboard('1');
        await flushPromises();

        // Assert: usable before anything is sent
        expect(logoutButton(wrapper).attributes('disabled')).toBeUndefined();

        // Act
        await logoutButton(wrapper).trigger('click');

        // Assert: disabled while the request is in flight
        expect(logoutButton(wrapper).attributes('disabled')).toBeDefined();

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });
});
