import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { LocationQueryRaw } from 'vue-router';

import VerifyEmail from '@/domains/auth/pages/VerifyEmail.vue';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';
import { createTestRouter } from '../../../utility/createTestRouter';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const token = 'a1b2c3d4e5f6';
const name = 'Jan de Vries';
const password = 'paarse-fiets-op-de-gracht';
const invalidLink = 'This verification link is invalid or has expired.';

// Shared, so the tests that find the form also prove the selector matches it.
// Otherwise a typo would make "form hidden" pass on its own.
const setPasswordForm = 'form[aria-label="Finish signing up"]';

// Mounts VerifyEmail on /verify-email with the app's real routes and the given
// query, the way the link in the mail opens it. VerifyEmail uses no store, so
// no Pinia.
const mountVerifyEmail = async (query: LocationQueryRaw = { token }, errorHandler?: (error: unknown) => void) =>
{
    const router = createTestRouter();
    await router.push({ name: 'verifyEmail', query });

    return mount(VerifyEmail, { global: { plugins: [router], config: { errorHandler } } });
};

type Wrapper = Awaited<ReturnType<typeof mountVerifyEmail>>;

// Types the name and both passwords the way a user does, then submits the form.
const submitNameAndPassword = async (wrapper: Wrapper) =>
{
    await wrapper.find('#verify-email-name').setValue(name);
    await wrapper.find('#verify-email-password').setValue(password);
    await wrapper.find('#verify-email-password-confirmation').setValue(password);
    await wrapper.find(setPasswordForm).trigger('submit');
};

describe('VerifyEmail page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should not post the token when the link is opened, and show the set-password form instead', async () =>
    {
        // Arrange + Act: open the link, and nothing else
        const wrapper = await mountVerifyEmail();
        await flushPromises();

        // Assert: the token is still unspent, and the form waits for the user
        expect(auth.verifyEmail).not.toHaveBeenCalled();
        expect(wrapper.find(setPasswordForm).exists()).toBe(true);
    });

    it('should post the token from the link with the typed name and passwords and show the password-set message with a login link when verifyEmail gets a 204 (no content)', async () =>
    {
        // Arrange: auth.verifyEmail is a stub (resolves, like a 204) and a spy (records its call)
        vi.mocked(auth.verifyEmail).mockResolvedValue();
        const wrapper = await mountVerifyEmail();

        // Act
        await submitNameAndPassword(wrapper);
        await flushPromises();

        // Assert (interaction): the link's token was joined with what the user typed
        expect(auth.verifyEmail).toHaveBeenCalledExactlyOnceWith({ token, name, password, password_confirmation: password });

        // Assert (outcome): the message sits in the live region and links to login
        const status = wrapper.find('[role="status"]');
        expect(status.text()).toContain('Your password is set.');
        expect(status.find('a').attributes('href')).toBe('/login');

        // Assert: nothing is left to do, so the form is gone
        expect(wrapper.find(setPasswordForm).exists()).toBe(false);
    });

    it('should stay on the page and remove the spent token from the URL, without showing the incomplete text, after a 204 (no content)', async () =>
    {
        // Arrange: auth.verifyEmail is a stub (resolves, like a 204)
        vi.mocked(auth.verifyEmail).mockResolvedValue();
        const wrapper = await mountVerifyEmail();

        // Act
        await submitNameAndPassword(wrapper);
        await flushPromises();

        // Assert (outcome): no automatic login, so no navigation: the user logs
        // in with the password they just chose. Only the token is gone from the
        // address bar, so a refresh or a copied URL can't post it again
        expect(wrapper.vm.$route.name).toBe('verifyEmail');
        expect(wrapper.vm.$route.query).toStrictEqual({});

        // Assert (outcome): an emptied URL still reads as done, not as an incomplete link
        expect(wrapper.find('[role="status"]').text()).toContain('Your password is set.');
        expect(wrapper.text()).not.toContain('This link is incomplete.');
    });

    it('should show the token error with a link to /register and hide the form when verifyEmail fails with a 422 (unprocessable) under token', async () =>
    {
        // Arrange: auth.verifyEmail is a stub that fails the way the backend
        // does for a used or expired token
        vi.mocked(auth.verifyEmail).mockRejectedValue(axiosErrorWith(422, { message: invalidLink, errors: { token: [invalidLink] } }));
        const wrapper = await mountVerifyEmail();

        // Act
        await submitNameAndPassword(wrapper);
        await flushPromises();

        // Assert: the message sits in the live region, under the id useForm gives it
        const error = wrapper.find('#verify-email-token-error');
        expect(error.text()).toContain(invalidLink);
        expect(wrapper.find('[role="status"]').element.contains(error.element)).toBe(true);

        // Assert: the way out is a new link, which registering again sends
        expect(error.find('a').attributes('href')).toBe('/register');

        // Assert: a dead link can't start working, so the form is gone
        expect(wrapper.find(setPasswordForm).exists()).toBe(false);
    });

    // One row per typed field that can get an error: that field is marked and
    // linked, the other stays clean, so each field's wiring is checked on its own.
    it.for([
        { field: 'name', otherField: 'password', message: 'The name field is required.' },
        { field: 'password', otherField: 'name', message: 'The password field confirmation does not match.' },
    ])('should show the error under its input, link it with aria-invalid and aria-describedby, and keep the form when verifyEmail fails with a 422 (unprocessable) under $field', async ({ field, otherField, message }) =>
    {
        // Arrange: auth.verifyEmail is a stub that fails the way Laravel validation does
        vi.mocked(auth.verifyEmail).mockRejectedValue(axiosErrorWith(422, { message, errors: { [field]: [message] } }));
        const wrapper = await mountVerifyEmail();
        const input = wrapper.find(`#verify-email-${field}`);

        // Assert: before any error, the input is marked valid and points nowhere
        expect(input.attributes('aria-invalid')).toBe('false');
        expect(input.attributes('aria-describedby')).toBeUndefined();

        // Act
        await submitNameAndPassword(wrapper);
        await flushPromises();

        // Assert: the error is shown, and its input points at it
        expect(wrapper.find(`#verify-email-${field}-error`).text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe(`verify-email-${field}-error`);

        // Assert: the field without an error has no error and points nowhere
        const otherInput = wrapper.find(`#verify-email-${otherField}`);
        expect(wrapper.find(`#verify-email-${otherField}-error`).exists()).toBe(false);
        expect(otherInput.attributes('aria-invalid')).toBe('false');
        expect(otherInput.attributes('aria-describedby')).toBeUndefined();

        // Assert: the link is still good, so the form stays for another try and nothing is announced
        expect(wrapper.find(setPasswordForm).exists()).toBe(true);
        expect(wrapper.find('[role="status"]').text()).toBe('');
    });

    it('should mark the confirmation input invalid and point it at the password error when verifyEmail fails with a 422 (unprocessable) under password', async () =>
    {
        // Arrange: Laravel reports a mismatch under password, never under
        // password_confirmation, so the confirmation input has to share that error
        const message = 'The password field confirmation does not match.';
        vi.mocked(auth.verifyEmail).mockRejectedValue(axiosErrorWith(422, { message, errors: { password: [message] } }));
        const wrapper = await mountVerifyEmail();
        const input = wrapper.find('#verify-email-password-confirmation');

        // Assert: before any error, the input is marked valid and points nowhere
        expect(input.attributes('aria-invalid')).toBe('false');
        expect(input.attributes('aria-describedby')).toBeUndefined();

        // Act
        await submitNameAndPassword(wrapper);
        await flushPromises();

        // Assert: a screen reader on the confirmation field hears the same error
        expect(wrapper.find('#verify-email-password-error').text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe('verify-email-password-error');
    });

    // A repeated ?token= arrives as an array, which the page can't post either,
    // so it counts as incomplete just like a missing one.
    it.for([
        { name: 'missing', query: {} },
        { name: 'empty', query: { token: '' } },
        { name: 'repeated', query: { token: [token, token] } },
    ])('should say the link is incomplete, link to /register and show no form when the token is $name', async ({ query }) =>
    {
        // Arrange + Act: open the link, and nothing else
        const wrapper = await mountVerifyEmail(query);
        await flushPromises();

        // Assert: the user is told why, and where to go
        expect(wrapper.text()).toContain('This link is incomplete.');
        const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'get a new link');
        expect(link?.attributes('href')).toBe('/register');

        // Assert: no form, so nothing can be posted with half a link, and the page didn't post on its own
        expect(wrapper.find(setPasswordForm).exists()).toBe(false);
        expect(auth.verifyEmail).not.toHaveBeenCalled();
    });

    it('should show the message in the live region when verifyEmail fails with a 422 (unprocessable) that has no field error', async () =>
    {
        // Arrange: a well-formed 422 with nothing to show next to a field, as
        // after a generic ValidationException or a renamed key on the backend
        const message = 'The given data was invalid.';
        vi.mocked(auth.verifyEmail).mockRejectedValue(axiosErrorWith(422, { message, errors: {} }));
        const wrapper = await mountVerifyEmail();

        // Act
        await submitNameAndPassword(wrapper);
        await flushPromises();

        // Assert: without it the user would see no feedback at all
        expect(wrapper.find('[role="status"]').text()).toBe(message);
    });

    it('should disable the submit button while verifyEmail is in flight', async () =>
    {
        // Arrange: auth.verifyEmail is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(auth.verifyEmail).mockReturnValue(request.promise);
        const wrapper = await mountVerifyEmail();
        const button = wrapper.find('button[type="submit"]');

        // Assert: usable before anything is sent
        expect(button.attributes('disabled')).toBeUndefined();

        // Act
        await submitNameAndPassword(wrapper);

        // Assert: disabled while the request is in flight
        expect(button.attributes('disabled')).toBeDefined();

        // Act: the request finishes
        request.resolve();
        await flushPromises();

        // Assert: the form made way for the password-set message
        expect(wrapper.find(setPasswordForm).exists()).toBe(false);
        expect(wrapper.find('[role="status"]').text()).toContain('Your password is set.');
    });

    it('should show the throttle message in the live region, keep the form and not hand the error on when verifyEmail fails with a 429 (too many requests)', async () =>
    {
        // Arrange: auth.verifyEmail is a stub that fails the way Laravel's
        // throttle middleware does. errorHandler is a spy standing in for
        // app.config.errorHandler, to prove the 429 never reaches it
        vi.mocked(auth.verifyEmail).mockRejectedValue(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '45' }));
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountVerifyEmail({ token }, errorHandler);

        // Act
        await submitNameAndPassword(wrapper);
        await flushPromises();

        // Assert (outcome): the wait is shown where a screen reader announces it
        expect(wrapper.find('[role="status"]').text()).toBe('Too many attempts. Try again in 1 minute.');

        // Assert (outcome): the token wasn't checked, so the form stays for a retry
        expect(wrapper.find(setPasswordForm).exists()).toBe(true);
        expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();

        // Assert (interaction): the page handled the 429 itself
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should hand the original error to the app error handler and keep the form usable when verifyEmail fails with a 500 (server error)', async () =>
    {
        // Arrange: auth.verifyEmail is a stub that fails with an error no field
        // can show. errorHandler is a spy standing in for app.config.errorHandler,
        // where Vue sends a rejected promise returned by an event handler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(auth.verifyEmail).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountVerifyEmail({ token }, errorHandler);

        // Act
        await submitNameAndPassword(wrapper);
        await flushPromises();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): the token may still be good, so the form stays
        expect(wrapper.find('[role="status"]').text()).toBe('');
        expect(wrapper.find(setPasswordForm).exists()).toBe(true);
        expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
    });
});
