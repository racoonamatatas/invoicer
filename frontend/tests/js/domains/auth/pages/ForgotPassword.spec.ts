import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

import { authRoutes } from '@/domains/auth/routes';
import { dashboardRoutes } from '@/domains/dashboard/routes';
import ForgotPassword from '@/domains/auth/pages/ForgotPassword.vue';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const email = 'jan@example.nl';
const confirmation = 'If that email has an account, we\'ve sent a password reset link to it.';

// Mounts ForgotPassword on /forgot-password with the app's real routes, so the
// RouterLink resolves the way it does in the app. No Pinia: the page uses no store.
const mountForgotPassword = async (errorHandler?: (error: unknown) => void) =>
{
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [...authRoutes, ...dashboardRoutes].map((route) => route.toRecord()),
    });
    await router.push({ name: 'forgotPassword' });

    return mount(ForgotPassword, { global: { plugins: [router], config: { errorHandler } } });
};

// Types the email the way a user does, then submits the form.
const submitEmail = async (wrapper: VueWrapper, value = email) =>
{
    await wrapper.find('#forgot-password-email').setValue(value);
    await wrapper.find('form[aria-label="Send a password reset link"]').trigger('submit');
};

describe('ForgotPassword page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should render the status region empty before anything is sent, so a screen reader already knows it', async () =>
    {
        // Act
        const wrapper = await mountForgotPassword();

        // Assert: the live region is there, and says nothing yet
        const status = wrapper.find('[role="status"]');
        expect(status.exists()).toBe(true);
        expect(status.text()).toBe('');
    });

    it('should post the typed email and show the neutral confirmation in the live region when forgotPassword gets a 204 (no content)', async () =>
    {
        // Arrange: auth.forgotPassword is a stub (resolves, like a 204) and a spy (records its call)
        vi.mocked(auth.forgotPassword).mockResolvedValue();
        const wrapper = await mountForgotPassword();

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert (interaction): the typed email reached the request
        expect(auth.forgotPassword).toHaveBeenCalledExactlyOnceWith(email);

        // Assert (outcome): the literal text, so a wording that hints whether the account exists fails here
        expect(wrapper.find('[role="status"]').text()).toBe(confirmation);
    });

    it('should keep the form after a 204 (no content) and post a corrected email when it is sent again', async () =>
    {
        // Arrange: the first email is mistyped, but the backend answers 204
        // either way, so the confirmation can't reveal the typo
        vi.mocked(auth.forgotPassword).mockResolvedValue();
        const wrapper = await mountForgotPassword();
        await submitEmail(wrapper, 'jan@exmaple.nl');
        await flushPromises();

        // Assert (outcome): the form is still there, next to the confirmation
        expect(wrapper.find('[role="status"]').text()).toBe(confirmation);
        expect(wrapper.find('form').exists()).toBe(true);

        // Act: fix the email and send again
        await submitEmail(wrapper, email);
        await flushPromises();

        // Assert (interaction): both sends went out, the corrected one last
        expect(auth.forgotPassword).toHaveBeenCalledTimes(2);
        expect(auth.forgotPassword).toHaveBeenLastCalledWith(email);
    });

    it('should show the error under the input and link it with aria-invalid and aria-describedby when forgotPassword fails with a 422 (unprocessable)', async () =>
    {
        // Arrange: auth.forgotPassword is a stub that fails the way Laravel validation does
        const message = 'The email field must be a valid email address.';
        vi.mocked(auth.forgotPassword).mockRejectedValue(axiosErrorWith(422, { message, errors: { email: [message] } }));
        const wrapper = await mountForgotPassword();
        const input = wrapper.find('#forgot-password-email');

        // Assert: before any error, the input is marked valid and points nowhere
        expect(input.attributes('aria-invalid')).toBe('false');
        expect(input.attributes('aria-describedby')).toBeUndefined();

        // Act
        await submitEmail(wrapper, 'jan');
        await flushPromises();

        // Assert: the error is shown, and the input points at it
        const error = wrapper.find('#forgot-password-email-error');
        expect(error.exists()).toBe(true);
        expect(error.text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('forgot-password-email-error');

        // Assert: the request was rejected, so no confirmation
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    it('should disable the submit button while forgotPassword is in flight and enable it again after a 204 (no content)', async () =>
    {
        // Arrange: auth.forgotPassword is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(auth.forgotPassword).mockReturnValue(request.promise);
        const wrapper = await mountForgotPassword();
        const button = wrapper.find('button[type="submit"]');

        // Assert: usable before anything is sent
        expect(button.attributes('disabled')).toBeUndefined();

        // Act
        await submitEmail(wrapper);

        // Assert: disabled while the request is in flight, so a double click sends one mail
        expect(button.attributes('disabled')).toBeDefined();

        // Act: the request finishes
        request.resolve();
        await flushPromises();

        // Assert: usable again, so another email can be sent
        expect(button.attributes('disabled')).toBeUndefined();
    });

    it('should show the throttle message in the live region and not hand the error on when forgotPassword fails with a 429 (too many requests)', async () =>
    {
        // Arrange: auth.forgotPassword is a stub that fails the way Laravel's
        // throttle middleware does. errorHandler is a spy standing in for
        // app.config.errorHandler, to prove the 429 never reaches it
        vi.mocked(auth.forgotPassword).mockRejectedValue(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '120' }));
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountForgotPassword(errorHandler);

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert (outcome): the wait is shown where a screen reader announces it
        expect(wrapper.find('[role="status"]').text()).toBe('Too many attempts. Try again in 2 minutes.');

        // Assert (interaction): the page handled the 429 itself
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should replace an earlier confirmation with the throttle message when the next send gets a 429 (too many requests)', async () =>
    {
        // Arrange: auth.forgotPassword is a stub that accepts the first send and throttles the second
        vi.mocked(auth.forgotPassword)
            .mockResolvedValueOnce()
            .mockRejectedValueOnce(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '60' }));
        const wrapper = await mountForgotPassword();
        await submitEmail(wrapper);
        await flushPromises();

        // Assert: the first send was confirmed
        expect(wrapper.find('[role="status"]').text()).toBe(confirmation);

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert: the old confirmation is gone; only the wait is shown
        expect(wrapper.find('[role="status"]').text()).toBe('Too many attempts. Try again in 1 minute.');
    });

    it('should hand the original error to the app error handler and show no confirmation when forgotPassword fails with a 500 (server error)', async () =>
    {
        // Arrange: errorHandler is a spy standing in for app.config.errorHandler,
        // where Vue sends a rejected promise returned by an event handler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(auth.forgotPassword).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountForgotPassword(errorHandler);

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): the request failed, so no confirmation, and the button is usable again
        expect(wrapper.find('[role="status"]').text()).toBe('');
        expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
    });

    it('should link back to /login', async () =>
    {
        // Act
        const wrapper = await mountForgotPassword();

        // Assert: found by its text, the way a user finds it
        const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'Back to log in');
        expect(link?.attributes('href')).toBe('/login');
    });
});
