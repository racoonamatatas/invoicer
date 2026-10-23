import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import Register from '@/domains/auth/pages/Register.vue';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const email = 'jan@example.nl';
const invalidEmail = 'The email field must be a valid email address.';

// Register uses neither the router nor a store, so it mounts on its own.
const mountRegister = (errorHandler?: (error: unknown) => void) =>
    mount(Register, { global: { config: { errorHandler } } });

// Types the email the way a user does, then submits the form.
const submitEmail = async (wrapper: VueWrapper) =>
{
    await wrapper.find('#register-email').setValue(email);
    await wrapper.find('form').trigger('submit');
};

describe('Register page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should ask for an email only, so no password exists before the inbox owner sets one through the link', () =>
    {
        // Act
        const wrapper = mountRegister();

        // Assert: the email input is the only input
        const inputs = wrapper.findAll('input');
        expect(inputs.map((input) => input.attributes('id'))).toStrictEqual(['register-email']);
    });

    it('should register with only the typed email and replace the form with the check-your-email message when register gets a 204 (no content)', async () =>
    {
        // Arrange: auth.register is a stub (resolves, like a 204) and a spy (records its call)
        vi.mocked(auth.register).mockResolvedValue();
        const wrapper = mountRegister();

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert (interaction): the typed email reached the request, and nothing else did
        expect(auth.register).toHaveBeenCalledExactlyOnceWith({ email });

        // Assert (outcome): the message names the typed email, and the form is gone
        expect(wrapper.find('[role="status"]').text()).toBe(
            'Check your inbox at jan@example.nl. We\'ve sent you an email with the next step.',
        );
        expect(wrapper.find('form').exists()).toBe(false);
    });

    it('should render the status region empty before any submit, so a screen reader already knows it', () =>
    {
        // Act
        const wrapper = mountRegister();

        // Assert: the live region is there, and says nothing yet
        const status = wrapper.find('[role="status"]');
        expect(status.exists()).toBe(true);
        expect(status.text()).toBe('');
    });

    it('should show the error under the email input, link it with aria-invalid and aria-describedby, and keep the form when register fails with a 422 (unprocessable) under email', async () =>
    {
        // Arrange: auth.register is a stub that fails the way Laravel validation does
        vi.mocked(auth.register).mockRejectedValue(axiosErrorWith(422, { message: invalidEmail, errors: { email: [invalidEmail] } }));
        const wrapper = mountRegister();
        const input = wrapper.find('#register-email');

        // Assert: before any error, the input is marked valid and points nowhere
        expect(input.attributes('aria-invalid')).toBe('false');
        expect(input.attributes('aria-describedby')).toBeUndefined();

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert: the error is shown, and its input points at it
        expect(wrapper.find('#register-email-error').text()).toBe(invalidEmail);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('register-email-error');

        // Assert: the user can still fix the field, and is not told an email was sent
        expect(wrapper.find('form').exists()).toBe(true);
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    it('should show the message in the live region when register fails with a 422 (unprocessable) that has no field error', async () =>
    {
        // Arrange: a well-formed 422 with nothing to show next to a field, as
        // after a generic ValidationException or a renamed key on the backend
        const message = 'The given data was invalid.';
        vi.mocked(auth.register).mockRejectedValue(axiosErrorWith(422, { message, errors: {} }));
        const wrapper = mountRegister();

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert: without it the user would see no feedback at all
        expect(wrapper.find('[role="status"]').text()).toBe(message);
    });

    it('should disable the submit button while register is in flight and enable it again after a 422 (unprocessable)', async () =>
    {
        // Arrange: auth.register is a stub whose request the test fails by hand.
        // A 422, not a 204: after a 204 the form, and its button, are gone
        const request = createDeferred();
        vi.mocked(auth.register).mockReturnValue(request.promise.then(() =>
        {
            throw axiosErrorWith(422, { message: invalidEmail, errors: { email: [invalidEmail] } });
        }));
        const wrapper = mountRegister();
        const button = wrapper.find('button[type="submit"]');

        // Assert: usable before anything is sent
        expect(button.attributes('disabled')).toBeUndefined();

        // Act
        await submitEmail(wrapper);

        // Assert: disabled while the request is in flight
        expect(button.attributes('disabled')).toBeDefined();

        // Act: the request fails validation
        request.resolve();
        await flushPromises();

        // Assert: usable again, so the user can fix the field and resubmit
        expect(button.attributes('disabled')).toBeUndefined();
    });

    it('should show the throttle message in the live region, keep the form and not hand the error on when register fails with a 429 (too many requests)', async () =>
    {
        // Arrange: auth.register is a stub that fails the way Laravel's throttle
        // middleware does. errorHandler is a spy standing in for app.config.errorHandler.
        // 3120 seconds is 52 minutes, a wait register's hourly mail-per-email limit can produce
        vi.mocked(auth.register).mockRejectedValue(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '3120' }));
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = mountRegister(errorHandler);

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert (outcome): the wait is shown where a screen reader announces it,
        // and the form stays so the user can try again later
        expect(wrapper.find('[role="status"]').text()).toBe('Too many attempts. Try again in 52 minutes.');
        expect(wrapper.find('form').exists()).toBe(true);

        // Assert (interaction): the page handled the 429 itself
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should hand the original error to the app error handler and show no message when register fails with a 500 (server error)', async () =>
    {
        // Arrange: auth.register is a stub that fails with an error no field can
        // show. errorHandler is a spy standing in for app.config.errorHandler,
        // where Vue sends a rejected promise returned by an event handler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(auth.register).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = mountRegister(errorHandler);

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): no email was sent, so no message, and the form is usable
        expect(wrapper.find('[role="status"]').text()).toBe('');
        expect(wrapper.find('form').exists()).toBe(true);
        expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
    });
});
