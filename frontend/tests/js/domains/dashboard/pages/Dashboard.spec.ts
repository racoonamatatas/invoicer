import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import Dashboard from '@/domains/dashboard/pages/Dashboard.vue';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';
import { createTestRouter } from '../../../utility/createTestRouter';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

// Mounts Dashboard on / with a fresh Pinia, so the real auth store starts
// empty, and the app's real routes, so its RouterLinks resolve.
const mountDashboard = async (errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);

    const router = createTestRouter();
    await router.push({ name: 'dashboard' });

    return mount(Dashboard, { global: { plugins: [pinia, router], config: { errorHandler } } });
};

describe('Dashboard page', () =>
{
    // assign is a spy (and a stub: it does nothing). jsdom can't do a real page
    // load, and won't let vi.spyOn redefine location.assign, so the whole
    // location is swapped for a copy with a spy in its place.
    const assign = vi.fn();

    beforeEach(() =>
    {
        vi.resetAllMocks();
        vi.stubGlobal('location', { ...window.location, assign });
    });

    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it('should link to /change-password, the only way to reach that page', async () =>
    {
        // Act
        const wrapper = await mountDashboard();

        // Assert: found by its text the way a user finds it
        const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'Change password');
        expect(link?.attributes('href')).toBe('/change-password');
    });

    it('should log out and do a full page load of /login when logout gets a 204 (no content)', async () =>
    {
        // Arrange: auth.logout is a stub (resolves, like a 204) and a spy (records its call)
        vi.mocked(auth.logout).mockResolvedValue();
        const wrapper = await mountDashboard();

        // Act
        await wrapper.find('button').trigger('click');
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
        vi.mocked(auth.logout).mockRejectedValue(error);
        const errorHandler = vi.fn();
        const wrapper = await mountDashboard(errorHandler);

        // Act
        await wrapper.find('button').trigger('click');
        await flushPromises();

        // Assert (interaction): no reload, so the user stays on a page that still
        // matches the backend, where they are logged in
        expect(assign).not.toHaveBeenCalled();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): the button is usable again, so the user can retry
        expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
    });

    it('should disable the log out button while logout is in flight', async () =>
    {
        // Arrange: auth.logout is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(auth.logout).mockReturnValue(request.promise);
        const wrapper = await mountDashboard();
        const button = wrapper.find('button');

        // Assert: usable before anything is sent
        expect(button.attributes('disabled')).toBeUndefined();

        // Act
        await button.trigger('click');

        // Assert: disabled while the request is in flight
        expect(button.attributes('disabled')).toBeDefined();

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await flushPromises();
    });
});
