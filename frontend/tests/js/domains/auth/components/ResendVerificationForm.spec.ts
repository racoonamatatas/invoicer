import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import ResendVerificationForm from '@/domains/auth/components/ResendVerificationForm.vue';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const email = 'jan@example.nl';
const confirmation = 'If that email has an unverified account, we\'ve sent a new link to it.';

// The form uses neither the router nor a store, so it mounts on its own.
const mountForm = (errorHandler?: (error: unknown) => void) =>
    mount(ResendVerificationForm, { global: { config: { errorHandler } } });

// Types the email the way a user does, then submits the form.
const submitEmail = async (wrapper: VueWrapper, value = email) =>
{
    await wrapper.find('#resend-verification-email').setValue(value);
    await wrapper.find('form').trigger('submit');
};

describe('ResendVerificationForm', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should render the status region empty before anything is sent, so a screen reader already knows it', () =>
    {
        // Act
        const wrapper = mountForm();

        // Assert: the live region is there, and says nothing yet
        const status = wrapper.find('[role="status"]');
        expect(status.exists()).toBe(true);
        expect(status.text()).toBe('');
    });

    it('should post the typed email and show the confirmation in the live region when resendVerification gets a 204 (no content)', async () =>
    {
        // Arrange: auth.resendVerification is a stub (resolves, like a 204) and a spy (records its call)
        vi.mocked(auth.resendVerification).mockResolvedValue();
        const wrapper = mountForm();

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert (interaction): the typed email reached the request
        expect(auth.resendVerification).toHaveBeenCalledExactlyOnceWith(email);

        // Assert (outcome): the confirmation sits in the live region
        expect(wrapper.find('[role="status"]').text()).toBe(confirmation);
    });

    it('should keep the form after a 204 (no content) and post a corrected email when it is sent again', async () =>
    {
        // Arrange: auth.resendVerification is a stub (resolves, like a 204) and a
        // spy (records its calls). The first email is mistyped, but the backend
        // answers 204 either way, so the confirmation can't reveal the typo
        vi.mocked(auth.resendVerification).mockResolvedValue();
        const wrapper = mountForm();
        await submitEmail(wrapper, 'jan@exmaple.nl');
        await flushPromises();

        // Assert (outcome): the form is still there, next to the confirmation
        expect(wrapper.find('[role="status"]').text()).toBe(confirmation);
        expect(wrapper.find('form').exists()).toBe(true);

        // Act: fix the email and send again
        await submitEmail(wrapper, email);
        await flushPromises();

        // Assert (interaction): both sends went out, the corrected one last
        expect(auth.resendVerification).toHaveBeenCalledTimes(2);
        expect(auth.resendVerification).toHaveBeenLastCalledWith(email);
    });

    it('should show the error under the input and link it with aria-invalid and aria-describedby when resendVerification fails with a 422 (unprocessable)', async () =>
    {
        // Arrange: auth.resendVerification is a stub that fails the way Laravel validation does
        const message = 'The email field must be a valid email address.';
        vi.mocked(auth.resendVerification).mockRejectedValue(axiosErrorWith(422, { message, errors: { email: [message] } }));
        const wrapper = mountForm();
        const input = wrapper.find('#resend-verification-email');

        // Assert: before any error, the input is marked valid and points nowhere
        expect(input.attributes('aria-invalid')).toBe('false');
        expect(input.attributes('aria-describedby')).toBeUndefined();

        // Act
        await submitEmail(wrapper, 'jan');
        await flushPromises();

        // Assert: the error is shown, and the input points at it
        const error = wrapper.find('#resend-verification-email-error');
        expect(error.exists()).toBe(true);
        expect(error.text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('resend-verification-email-error');

        // Assert: the request was rejected, so no confirmation
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    it('should disable the submit button while resendVerification is in flight and enable it again after a 204 (no content)', async () =>
    {
        // Arrange: auth.resendVerification is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(auth.resendVerification).mockReturnValue(request.promise);
        const wrapper = mountForm();
        const button = wrapper.find('button[type="submit"]');

        // Assert: usable before anything is sent
        expect(button.attributes('disabled')).toBeUndefined();

        // Act
        await submitEmail(wrapper);

        // Assert: disabled while the request is in flight
        expect(button.attributes('disabled')).toBeDefined();

        // Act: the request finishes
        request.resolve();
        await flushPromises();

        // Assert: usable again, so another email can be sent
        expect(button.attributes('disabled')).toBeUndefined();
    });

    it('should show the throttle message in the live region and not hand the error on when resendVerification fails with a 429 (too many requests)', async () =>
    {
        // Arrange: auth.resendVerification is a stub that fails the way Laravel's
        // throttle middleware does. errorHandler is a spy standing in for
        // app.config.errorHandler, to prove the 429 never reaches it
        vi.mocked(auth.resendVerification).mockRejectedValue(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '120' }));
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = mountForm(errorHandler);

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert (outcome): the wait is shown where a screen reader announces it
        expect(wrapper.find('[role="status"]').text()).toBe('Too many attempts. Try again in 2 minutes.');

        // Assert (interaction): the form handled the 429 itself
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should replace an earlier confirmation with the throttle message when the next send gets a 429 (too many requests)', async () =>
    {
        // Arrange: auth.resendVerification is a stub that accepts the first send
        // and throttles the second
        vi.mocked(auth.resendVerification)
            .mockResolvedValueOnce()
            .mockRejectedValueOnce(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '60' }));
        const wrapper = mountForm();
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

    it('should hand the original error to the app error handler and show no confirmation when resendVerification fails with a 500 (server error)', async () =>
    {
        // Arrange: auth.resendVerification is a stub that fails with an error no
        // field can show. errorHandler is a spy standing in for app.config.errorHandler,
        // where Vue sends a rejected promise returned by an event handler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(auth.resendVerification).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = mountForm(errorHandler);

        // Act
        await submitEmail(wrapper);
        await flushPromises();

        // Assert (interaction): the form didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): the request failed, so no confirmation, and the button is usable again
        expect(wrapper.find('[role="status"]').text()).toBe('');
        expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
    });
});
