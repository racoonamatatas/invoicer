import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

import { authRoutes } from '@/domains/auth/routes';
import { dashboardRoutes } from '@/domains/dashboard/routes';
import ChangePassword from '@/domains/auth/pages/ChangePassword.vue';
import { useAuthStore } from '@/domains/auth/store';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const email = 'jan@example.nl';
const change = { current_password: 'the-old-long-password', password: 'a-new-long-password', password_confirmation: 'a-new-long-password' };

// Shared, so the tests that find the form also prove the selector matches it.
// Otherwise a typo would make "form hidden" pass on its own.
const changeForm = 'form[aria-label="Change password"]';

// Mounts ChangePassword on /change-password with the app's real routes, so
// the dashboard links resolve. The route is protected, so the user is logged
// in first, through the store the way the login page does it. No guard is
// registered, so the test only sees what ChangePassword itself does.
const mountChangePassword = async (errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);

    vi.mocked(auth.login).mockResolvedValue({ id: 1, name: 'Jan de Vries', email });
    await useAuthStore().login({ email, password: change.current_password });

    const router = createRouter({
        history: createMemoryHistory(),
        routes: [...authRoutes, ...dashboardRoutes].map((route) => route.toRecord()),
    });
    await router.push({ name: 'changePassword' });

    return mount(ChangePassword, { global: { plugins: [pinia, router], config: { errorHandler } } });
};

type Wrapper = Awaited<ReturnType<typeof mountChangePassword>>;

// Types all three passwords the way a user does, then submits the form.
const submitChange = async (wrapper: Wrapper) =>
{
    await wrapper.find('#change-password-current-password').setValue(change.current_password);
    await wrapper.find('#change-password-password').setValue(change.password);
    await wrapper.find('#change-password-password-confirmation').setValue(change.password_confirmation);
    await wrapper.find(changeForm).trigger('submit');
};

describe('ChangePassword page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should show the logged-in user\'s email read-only, so a password manager saves the new password under it', async () =>
    {
        // Act
        const wrapper = await mountChangePassword();

        // Assert: filled from the store, and not editable
        const input = wrapper.get<HTMLInputElement>('#change-password-email');
        expect(input.element.value).toBe(email);
        expect(input.attributes('readonly')).toBeDefined();
    });

    it('should put the typed passwords and show the changed message with a dashboard link when changePassword gets a 204 (no content)', async () =>
    {
        // Arrange: auth.changePassword is a stub (resolves, like a 204) and a spy (records its call)
        vi.mocked(auth.changePassword).mockResolvedValue();
        const wrapper = await mountChangePassword();

        // Act
        await submitChange(wrapper);
        await flushPromises();

        // Assert (interaction): exactly the three fields the backend reads
        expect(auth.changePassword).toHaveBeenCalledExactlyOnceWith(change);

        // Assert (outcome): the message sits in the live region and links back to the dashboard
        const status = wrapper.find('[role="status"]');
        expect(status.text()).toContain('Your password is changed.');
        expect(status.find('a').attributes('href')).toBe('/');

        // Assert: nothing is left to do, so the form is gone
        expect(wrapper.find(changeForm).exists()).toBe(false);
    });

    it('should keep the user logged in when changePassword gets a 204 (no content)', async () =>
    {
        // Arrange: unlike a reset, the backend keeps this session
        vi.mocked(auth.changePassword).mockResolvedValue();
        const wrapper = await mountChangePassword();
        const store = useAuthStore();

        // Act
        await submitChange(wrapper);
        await flushPromises();

        // Assert (outcome): proves the response was handled, so the next assert can't pass early
        expect(wrapper.find('[role="status"]').text()).toContain('Your password is changed.');

        // Assert (outcome): the store still agrees with the backend
        expect(store.isLoggedIn).toBe(true);

        // Assert (interaction): no logout request
        expect(auth.logout).not.toHaveBeenCalled();
    });

    it('should show the error under the current password input, link it with aria-invalid and aria-describedby, and keep the form when changePassword fails with a 422 (unprocessable) under current_password', async () =>
    {
        // Arrange: Laravel's current_password rule answers a wrong password like this
        const message = 'The password is incorrect.';
        vi.mocked(auth.changePassword).mockRejectedValue(axiosErrorWith(422, { message, errors: { current_password: [message] } }));
        const wrapper = await mountChangePassword();
        const input = wrapper.find('#change-password-current-password');

        // Assert: before any error, the input is marked valid and points nowhere
        expect(input.attributes('aria-invalid')).toBe('false');
        expect(input.attributes('aria-describedby')).toBeUndefined();

        // Act
        await submitChange(wrapper);
        await flushPromises();

        // Assert: the error is shown, and the input points at it
        expect(wrapper.find('#change-password-current_password-error').text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('change-password-current_password-error');

        // Assert: the form stays for another try, and nothing is announced
        expect(wrapper.find(changeForm).exists()).toBe(true);
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    // Laravel reports a mismatch under password, never under
    // password_confirmation, so both new-password inputs share that error.
    it.for([
        { name: 'new password', id: 'change-password-password' },
        { name: 'confirmation', id: 'change-password-password-confirmation' },
    ])('should mark the $name input invalid and point it at the password error when changePassword fails with a 422 (unprocessable) under password', async ({ id }) =>
    {
        // Arrange
        const message = 'The password field confirmation does not match.';
        vi.mocked(auth.changePassword).mockRejectedValue(axiosErrorWith(422, { message, errors: { password: [message] } }));
        const wrapper = await mountChangePassword();
        const input = wrapper.find(`#${id}`);

        // Assert: before any error, the input is marked valid and points nowhere
        expect(input.attributes('aria-invalid')).toBe('false');
        expect(input.attributes('aria-describedby')).toBeUndefined();

        // Act
        await submitChange(wrapper);
        await flushPromises();

        // Assert: a screen reader on either field hears the same error
        expect(wrapper.find('#change-password-password-error').text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('change-password-password-error');
    });

    it('should show the message in the live region when changePassword fails with a 422 (unprocessable) that has no field error', async () =>
    {
        // Arrange: a well-formed 422 with nothing to show next to a field, as
        // after a renamed key on the backend
        const message = 'The given data was invalid.';
        vi.mocked(auth.changePassword).mockRejectedValue(axiosErrorWith(422, { message, errors: {} }));
        const wrapper = await mountChangePassword();

        // Act
        await submitChange(wrapper);
        await flushPromises();

        // Assert: without it the user would see no feedback at all
        expect(wrapper.find('[role="status"]').text()).toBe(message);
    });

    it('should show the throttle message in the live region, keep the form and not hand the error on when changePassword fails with a 429 (too many requests)', async () =>
    {
        // Arrange: auth.changePassword is a stub that fails the way Laravel's
        // throttle middleware does. errorHandler is a spy standing in for
        // app.config.errorHandler, to prove the 429 never reaches it
        vi.mocked(auth.changePassword).mockRejectedValue(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '45' }));
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountChangePassword(errorHandler);

        // Act
        await submitChange(wrapper);
        await flushPromises();

        // Assert (outcome): the wait is shown where a screen reader announces it
        expect(wrapper.find('[role="status"]').text()).toBe('Too many attempts. Try again in 1 minute.');

        // Assert (outcome): nothing was changed, so the form stays for a retry
        expect(wrapper.find(changeForm).exists()).toBe(true);

        // Assert (interaction): the page handled the 429 itself
        expect(errorHandler).not.toHaveBeenCalled();
    });
});
