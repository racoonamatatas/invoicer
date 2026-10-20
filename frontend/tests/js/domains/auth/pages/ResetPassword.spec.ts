import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMemoryHistory, createRouter, type LocationQueryRaw } from 'vue-router';

import { authRoutes } from '@/domains/auth/routes';
import ResetPassword from '@/domains/auth/pages/ResetPassword.vue';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const token = 'a1b2c3d4e5f6';
const email = 'jan@example.nl';
const password = 'a-new-long-password';
const invalidLink = 'This reset link is invalid or has expired.';

// Shared, so the tests that find the form also prove the selector matches it.
// Otherwise a typo would make "form hidden" pass on its own.
const resetForm = 'form[aria-label="Choose a new password"]';

// Mounts ResetPassword on /reset-password with the app's real routes and the
// given query, the way the link in the mail opens it. ResetPassword uses no
// store, so no Pinia.
const mountResetPassword = async (query: LocationQueryRaw = { token, email }, errorHandler?: (error: unknown) => void) =>
{
    const router = createRouter({
        history: createMemoryHistory(),
        routes: authRoutes.map((route) => route.toRecord()),
    });
    await router.push({ name: 'resetPassword', query });

    return mount(ResetPassword, { global: { plugins: [router], config: { errorHandler } } });
};

type Wrapper = Awaited<ReturnType<typeof mountResetPassword>>;

// Types both passwords the way a user does, then submits the form.
const submitPasswords = async (wrapper: Wrapper) =>
{
    await wrapper.find('#reset-password-password').setValue(password);
    await wrapper.find('#reset-password-password-confirmation').setValue(password);
    await wrapper.find(resetForm).trigger('submit');
};

describe('ResetPassword page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should show the email from the link read-only, so the user sees which account is being reset', async () =>
    {
        // Act
        const wrapper = await mountResetPassword();

        // Assert: prefilled from the query, and not editable
        const input = wrapper.get<HTMLInputElement>('#reset-password-email');
        expect(input.element.value).toBe(email);
        expect(input.attributes('readonly')).toBeDefined();
    });

    it('should post the token and email from the link with the typed passwords and show the changed message with a login link when resetPassword gets a 204 (no content)', async () =>
    {
        // Arrange: auth.resetPassword is a stub (resolves, like a 204) and a spy (records its call)
        vi.mocked(auth.resetPassword).mockResolvedValue();
        const wrapper = await mountResetPassword();

        // Act
        await submitPasswords(wrapper);
        await flushPromises();

        // Assert (interaction): the link's token and email were joined with what the user typed
        expect(auth.resetPassword).toHaveBeenCalledExactlyOnceWith({ token, email, password, password_confirmation: password });

        // Assert (outcome): the message sits in the live region and links to login
        const status = wrapper.find('[role="status"]');
        expect(status.text()).toContain('Your password is changed.');
        expect(status.find('a').attributes('href')).toBe('/login');

        // Assert: nothing is left to do, so the form is gone
        expect(wrapper.find(resetForm).exists()).toBe(false);
    });

    it('should remove the token and email from the URL and not show the incomplete text after a 204 (no content)', async () =>
    {
        // Arrange: auth.resetPassword is a stub (resolves, like a 204)
        vi.mocked(auth.resetPassword).mockResolvedValue();
        const wrapper = await mountResetPassword();

        // Act
        await submitPasswords(wrapper);
        await flushPromises();

        // Assert (outcome): the token is gone from the address bar and the history entry
        expect(wrapper.vm.$route.query).toStrictEqual({});

        // Assert (outcome): an emptied URL still reads as changed, not as an incomplete link
        expect(wrapper.find('[role="status"]').text()).toContain('Your password is changed.');
        expect(wrapper.text()).not.toContain('This link is incomplete.');
    });

    // The backend answers a bad token with a 422 under token. A malformed email
    // in the link fails validation under email. Neither has an input, and both
    // mean the same to the user: the link is bad.
    it.for([
        { field: 'token', message: invalidLink },
        { field: 'email', message: 'The email field must be a valid email address.' },
    ])('should show the $field error with a link to /forgot-password and hide the form when resetPassword fails with a 422 (unprocessable) under $field', async ({ field, message }) =>
    {
        // Arrange: auth.resetPassword is a stub that fails the way Laravel validation does
        vi.mocked(auth.resetPassword).mockRejectedValue(axiosErrorWith(422, { message, errors: { [field]: [message] } }));
        const wrapper = await mountResetPassword();

        // Act
        await submitPasswords(wrapper);
        await flushPromises();

        // Assert: the message sits in the live region, under the id useForm gives it
        const error = wrapper.find(`#reset-password-${field}-error`);
        expect(error.text()).toContain(message);
        expect(wrapper.find('[role="status"]').element.contains(error.element)).toBe(true);

        // Assert: the way out is a new link
        expect(error.find('a').attributes('href')).toBe('/forgot-password');

        // Assert: a bad link can't start working, so the form is gone
        expect(wrapper.find(resetForm).exists()).toBe(false);
    });

    it('should show the error under the password input, link it with aria-invalid and aria-describedby, and keep the form when resetPassword fails with a 422 (unprocessable) under password', async () =>
    {
        // Arrange: a mismatch is one of the errors Laravel puts under password
        const message = 'The password field confirmation does not match.';
        vi.mocked(auth.resetPassword).mockRejectedValue(axiosErrorWith(422, { message, errors: { password: [message] } }));
        const wrapper = await mountResetPassword();
        const input = wrapper.find('#reset-password-password');

        // Assert: before any error, the input is marked valid and points nowhere
        expect(input.attributes('aria-invalid')).toBe('false');
        expect(input.attributes('aria-describedby')).toBeUndefined();

        // Act
        await submitPasswords(wrapper);
        await flushPromises();

        // Assert: the error is shown, and the input points at it
        const error = wrapper.find('#reset-password-password-error');
        expect(error.text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('reset-password-password-error');

        // Assert: the link is still good, so the form stays for another try and nothing is announced
        expect(wrapper.find(resetForm).exists()).toBe(true);
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    // A repeated query key arrives as an array, which the page can't post
    // either, so it counts as incomplete just like a missing one.
    it.for([
        { name: 'the token is missing', query: { email } },
        { name: 'the email is missing', query: { token } },
        { name: 'the token is empty', query: { token: '', email } },
        { name: 'the token is repeated', query: { token: [token, token], email } },
    ])('should say the link is incomplete, link to /forgot-password and show no form when $name', async ({ query }) =>
    {
        // Act: open the link, and nothing else
        const wrapper = await mountResetPassword(query);

        // Assert: the user is told why, and where to go
        expect(wrapper.text()).toContain('This link is incomplete.');
        const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'request a new link');
        expect(link?.attributes('href')).toBe('/forgot-password');

        // Assert: no form, so nothing can be posted with half a link
        expect(wrapper.find(resetForm).exists()).toBe(false);
    });

    it('should disable the submit button while resetPassword is in flight', async () =>
    {
        // Arrange: auth.resetPassword is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(auth.resetPassword).mockReturnValue(request.promise);
        const wrapper = await mountResetPassword();
        const button = wrapper.find('button[type="submit"]');

        // Assert: usable before anything is sent
        expect(button.attributes('disabled')).toBeUndefined();

        // Act
        await submitPasswords(wrapper);

        // Assert: disabled while the request is in flight
        expect(button.attributes('disabled')).toBeDefined();

        // Act: the request finishes
        request.resolve();
        await flushPromises();

        // Assert: the form made way for the changed message
        expect(wrapper.find(resetForm).exists()).toBe(false);
        expect(wrapper.find('[role="status"]').text()).toContain('Your password is changed.');
    });

    it('should show the throttle message in the live region, keep the form and not hand the error on when resetPassword fails with a 429 (too many requests)', async () =>
    {
        // Arrange: auth.resetPassword is a stub that fails the way Laravel's
        // throttle middleware does. errorHandler is a spy standing in for
        // app.config.errorHandler, to prove the 429 never reaches it
        vi.mocked(auth.resetPassword).mockRejectedValue(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '45' }));
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountResetPassword({ token, email }, errorHandler);

        // Act
        await submitPasswords(wrapper);
        await flushPromises();

        // Assert (outcome): the wait is shown where a screen reader announces it
        expect(wrapper.find('[role="status"]').text()).toBe('Too many attempts. Try again in 1 minute.');

        // Assert (outcome): the token wasn't checked, so the form stays for a retry
        expect(wrapper.find(resetForm).exists()).toBe(true);

        // Assert (interaction): the page handled the 429 itself
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should hand the original error to the app error handler and show no message when resetPassword fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler,
        // where Vue sends a rejected promise returned by an event handler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(auth.resetPassword).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountResetPassword({ token, email }, errorHandler);

        // Act
        await submitPasswords(wrapper);
        await flushPromises();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): nothing changed, so no message, and the form is usable again
        expect(wrapper.find('[role="status"]').text()).toBe('');
        expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
    });
});
