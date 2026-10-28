import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import ChangePassword from '@/domains/auth/pages/ChangePassword.vue';
import { useAuthStore } from '@/domains/auth/store';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';
import { createTestRouter } from '../../../utility/createTestRouter';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const email = 'jan@example.nl';
const change = { current_password: 'the-old-long-password', password: 'a-new-long-password', password_confirmation: 'a-new-long-password' };

// Shared, so the tests that find the form also prove the selector matches it.
// Otherwise a typo would make "form hidden" pass on its own.
const changeForm = 'form[aria-label="Change password"]';

// Mounts ChangePassword on /change-password with the app's real routes, so
// the links to home resolve. The route is protected, so the user is logged
// in first, through the store the way the login page does it.
const mountChangePassword = async (errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);

    vi.mocked(auth.login).mockResolvedValue({ id: 1, name: 'Jan de Vries', email });
    await useAuthStore().login({ email, password: change.current_password });

    const router = createTestRouter();
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

    it('should put the typed passwords and show the changed message with a Continue link to home when changePassword gets a 204 (no content)', async () =>
    {
        // Arrange: auth.changePassword is a stub (resolves, like a 204) and a spy (records its call)
        vi.mocked(auth.changePassword).mockResolvedValue();
        const wrapper = await mountChangePassword();

        // Act
        await submitChange(wrapper);
        await flushPromises();

        // Assert (interaction): exactly the three fields the backend reads
        expect(auth.changePassword).toHaveBeenCalledExactlyOnceWith(change);

        // Assert (outcome): the message sits in the live region and links on to home
        const status = wrapper.find('[role="status"]');
        expect(status.text()).toContain('Your password is changed.');
        expect(status.find('a').text()).toBe('Continue');
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

    it('should link to home next to the form, so the user can leave without changing anything', async () =>
    {
        // Act
        const wrapper = await mountChangePassword();

        // Assert: the form is showing, and so is the way out, found by its text the way a user finds it
        expect(wrapper.find(changeForm).exists()).toBe(true);
        const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'Cancel');
        expect(link?.attributes('href')).toBe('/');
    });

    it('should disable the submit button while changePassword is in flight', async () =>
    {
        // Arrange: auth.changePassword is a stub whose request the test finishes
        // by hand. A second submit would matter here: it would send a current
        // password the first request is about to make wrong
        const request = createDeferred();
        vi.mocked(auth.changePassword).mockReturnValue(request.promise);
        const wrapper = await mountChangePassword();
        const button = wrapper.find('button[type="submit"]');

        // Assert: usable before anything is sent
        expect(button.attributes('disabled')).toBeUndefined();

        // Act
        await submitChange(wrapper);

        // Assert: disabled while the request is in flight
        expect(button.attributes('disabled')).toBeDefined();

        // Act: the request finishes
        request.resolve();
        await flushPromises();

        // Assert: the form made way for the changed message
        expect(wrapper.find(changeForm).exists()).toBe(false);
        expect(wrapper.find('[role="status"]').text()).toContain('Your password is changed.');
    });

    it('should hand the original error to the app error handler and show no message when changePassword fails with a 500 (server error)', async () =>
    {
        // Arrange: auth.changePassword is a stub that fails the way a crashed
        // backend does. errorHandler is a spy standing in for
        // app.config.errorHandler, where Vue sends a rejected promise returned
        // by an event handler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(auth.changePassword).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountChangePassword(errorHandler);

        // Act
        await submitChange(wrapper);
        await flushPromises();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): nothing changed, so no message, and the form is usable again
        expect(wrapper.find('[role="status"]').text()).toBe('');
        expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
    });
});
