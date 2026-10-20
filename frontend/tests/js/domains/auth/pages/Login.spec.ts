import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';

import { authRoutes } from '@/domains/auth/routes';
import { dashboardRoutes } from '@/domains/dashboard/routes';
import Login from '@/domains/auth/pages/Login.vue';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const user = { id: 1, name: 'Jan de Vries', email: 'jan@example.nl' };
const credentials = { email: 'jan@example.nl', password: 'secret-password' };

// Shared, so the test that finds the resend form also proves the selector
// matches it. Otherwise a typo would make "not shown" pass on its own.
const resendForm = 'form[aria-label="Get a new verification link"]';

// Mounts Login on /login with the app's real routes. The memory history is a
// fake: a working in-memory stand-in for the browser's address bar. No guard
// is registered, so the test only sees what Login itself does.
const mountLogin = async (errorHandler?: (error: unknown) => void) =>
{
    const pinia = createPinia();
    setActivePinia(pinia);

    const router = createRouter({
        history: createMemoryHistory(),
        routes: [...authRoutes, ...dashboardRoutes].map((route) => route.toRecord()),
    });
    await router.push({ name: 'login' });

    const wrapper = mount(Login, { global: { plugins: [pinia, router], config: { errorHandler } } });

    return { wrapper, router };
};

// Types the credentials the way a user does, then submits the form.
const submitCredentials = async (wrapper: Awaited<ReturnType<typeof mountLogin>>['wrapper']) =>
{
    await wrapper.find('#login-email').setValue(credentials.email);
    await wrapper.find('#login-password').setValue(credentials.password);
    await wrapper.find('form').trigger('submit');
};

describe('Login page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should log in with the typed credentials and go to the dashboard when login gets a 200 (ok)', async () =>
    {
        // Arrange: auth.login is a stub (canned user) and a spy (records its call)
        vi.mocked(auth.login).mockResolvedValue(user);
        const { wrapper, router } = await mountLogin();

        // Act
        await submitCredentials(wrapper);

        // Assert (outcome): the user ended up on the dashboard. waitFor retries,
        // because the dashboard route lazy-loads its page before the push resolves
        await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('dashboard'));

        // Assert (interaction): the typed values reached the request
        expect(auth.login).toHaveBeenCalledExactlyOnceWith(credentials);
    });

    // One row per field: the field with the error is marked and linked, the
    // other field stays clean, so each field's wiring is checked on its own.
    it.for([
        { name: 'email', field: 'email', otherField: 'password', message: 'These credentials do not match our records.' },
        { name: 'password', field: 'password', otherField: 'email', message: 'The password field is required.' },
    ])('should show the error under its input and link it with aria-invalid and aria-describedby when login fails with a 422 (unprocessable): $name', async ({ field, otherField, message }) =>
    {
        // Arrange: auth.login is a stub that fails the way Laravel validation does
        vi.mocked(auth.login).mockRejectedValue(axiosErrorWith(422, { message, errors: { [field]: [message] } }));
        const { wrapper } = await mountLogin();

        // Act
        await submitCredentials(wrapper);
        await flushPromises();

        // Assert: the error is shown, and its input points at it
        const input = wrapper.find(`#login-${field}`);
        expect(wrapper.find(`#login-${field}-error`).text()).toBe(message);
        expect(input.attributes('aria-invalid')).toBe('true');
        expect(input.attributes('aria-describedby')).toBe(`login-${field}-error`);

        // Assert: the field without an error has no error and points nowhere
        const otherInput = wrapper.find(`#login-${otherField}`);
        expect(wrapper.find(`#login-${otherField}-error`).exists()).toBe(false);
        expect(otherInput.attributes('aria-invalid')).toBe('false');
        expect(otherInput.attributes('aria-describedby')).toBeUndefined();
    });

    it('should not navigate when login fails with a 422 (unprocessable)', async () =>
    {
        // Arrange: auth.login is a stub that fails validation. router.push is a
        // spy that still navigates: the dashboard page loads lazily, so the
        // route alone could still read 'login' while a wrong push is under way
        vi.mocked(auth.login).mockRejectedValue(axiosErrorWith(422, {
            message: 'These credentials do not match our records.',
            errors: { email: ['These credentials do not match our records.'] },
        }));
        const { wrapper, router } = await mountLogin();
        const push = vi.spyOn(router, 'push');

        // Act
        await submitCredentials(wrapper);
        await flushPromises();

        // Assert (interaction): no navigation was started
        expect(push).not.toHaveBeenCalled();

        // Assert (outcome)
        expect(router.currentRoute.value.name).toBe('login');
    });

    it('should show the resend form prefilled with the typed email when login fails with a 422 (unprocessable) for an unverified email', async () =>
    {
        // Arrange: auth.login is a stub that fails the way the backend does for an unverified email
        vi.mocked(auth.login).mockRejectedValue(axiosErrorWith(422, {
            message: 'Verify your email before logging in.',
            errors: { email: ['Verify your email before logging in.'] },
            code: 'email_not_verified',
        }));
        const { wrapper } = await mountLogin();

        // Act
        await submitCredentials(wrapper);
        await flushPromises();

        // Assert: found by its accessible name, the way a screen reader finds it
        expect(wrapper.find(resendForm).exists()).toBe(true);

        // Assert: the email typed into the login form reached the resend form
        expect(wrapper.get<HTMLInputElement>('#resend-verification-email').element.value).toBe(credentials.email);
    });

    it('should announce the resend form in the live region when login fails with a 422 (unprocessable) for an unverified email', async () =>
    {
        // Arrange
        vi.mocked(auth.login).mockRejectedValue(axiosErrorWith(422, {
            message: 'Verify your email before logging in.',
            errors: { email: ['Verify your email before logging in.'] },
            code: 'email_not_verified',
        }));
        const { wrapper } = await mountLogin();

        // Act
        await submitCredentials(wrapper);
        await flushPromises();

        // Assert: the first status region is the login page's own; the resend form has one too
        expect(wrapper.find('[role="status"]').text()).toBe('Your email isn\'t verified yet. You can get a new link below.');
    });

    it('should not show the resend form when login fails with a 422 (unprocessable) for wrong credentials', async () =>
    {
        // Arrange: a plain validation failure, without a code
        const message = 'These credentials do not match our records.';
        vi.mocked(auth.login).mockRejectedValue(axiosErrorWith(422, { message, errors: { email: [message] } }));
        const { wrapper } = await mountLogin();

        // Act
        await submitCredentials(wrapper);
        await flushPromises();

        // Assert: the 422 has been rendered, so the absence below isn't just "too early"
        expect(wrapper.find('#login-email-error').text()).toBe(message);

        // Assert
        expect(wrapper.find(resendForm).exists()).toBe(false);
    });

    it('should prefill the resend form with the new email when a second login with a different email also fails with a 422 (unprocessable) for an unverified email', async () =>
    {
        // Arrange: every login gets the unverified 422, and the first one has
        // already shown the resend form with the first email
        vi.mocked(auth.login).mockRejectedValue(axiosErrorWith(422, {
            message: 'Verify your email before logging in.',
            errors: { email: ['Verify your email before logging in.'] },
            code: 'email_not_verified',
        }));
        const { wrapper } = await mountLogin();
        await submitCredentials(wrapper);
        await flushPromises();

        // Act: the login form by name, since the resend form is a second form on the page now
        await wrapper.find('#login-email').setValue('piet@example.nl');
        await wrapper.find('form[aria-label="Log in"]').trigger('submit');
        await flushPromises();

        // Assert: the resend form copies initialEmail only once, so the new
        // address only arrives because submit() resets code, which remounts it
        expect(wrapper.get<HTMLInputElement>('#resend-verification-email').element.value).toBe('piet@example.nl');
    });

    it('should disable the submit button while login is in flight and enable it again after a 200 (ok)', async () =>
    {
        // Arrange: auth.login is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(auth.login).mockReturnValue(request.promise.then(() => user));
        const { wrapper, router } = await mountLogin();
        const button = wrapper.find('button[type="submit"]');

        // Assert: usable before anything is sent
        expect(button.attributes('disabled')).toBeUndefined();

        // Act
        await submitCredentials(wrapper);

        // Assert: disabled while the request is in flight
        expect(button.attributes('disabled')).toBeDefined();

        // Act: the request finishes, and the page navigates
        request.resolve();
        await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('dashboard'));
        await flushPromises();

        // Assert: usable again once submit() is done
        expect(button.attributes('disabled')).toBeUndefined();
    });

    it('should render the status region empty before any submit, so a screen reader already knows it', async () =>
    {
        // Act
        const { wrapper } = await mountLogin();

        // Assert: the live region is there, and says nothing yet
        const status = wrapper.find('[role="status"]');
        expect(status.exists()).toBe(true);
        expect(status.text()).toBe('');
    });

    it('should show the throttle message in the live region, not navigate and not hand the error on when login fails with a 429 (too many requests)', async () =>
    {
        // Arrange: auth.login is a stub that fails the way Laravel's throttle
        // middleware does. router.push is a spy that still navigates, and
        // errorHandler is a spy standing in for app.config.errorHandler
        vi.mocked(auth.login).mockRejectedValue(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '60' }));
        const errorHandler = vi.fn<(error: unknown) => void>();
        const { wrapper, router } = await mountLogin(errorHandler);
        const push = vi.spyOn(router, 'push');

        // Act
        await submitCredentials(wrapper);
        await flushPromises();

        // Assert (outcome): the wait is shown where a screen reader announces it
        expect(wrapper.find('[role="status"]').text()).toBe('Too many attempts. Try again in 1 minute.');

        // Assert (interaction): no navigation was started, and the page handled the 429 itself
        expect(push).not.toHaveBeenCalled();
        expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should hand the original error to the app error handler and stay on login when login fails with a 500 (server error)', async () =>
    {
        // Arrange: auth.login is a stub that fails with an error no field can
        // show. errorHandler is a spy standing in for app.config.errorHandler,
        // where Vue sends a rejected promise returned by an event handler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(auth.login).mockRejectedValue(error);
        const errorHandler = vi.fn();
        const { wrapper, router } = await mountLogin(errorHandler);

        // Act
        await submitCredentials(wrapper);
        await flushPromises();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): still on login, and the button is usable again
        expect(router.currentRoute.value.name).toBe('login');
        expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
    });

    it('should link to /forgot-password', async () =>
    {
        // Act
        const { wrapper } = await mountLogin();

        // Assert: found by its text, the way a user finds it
        const link = wrapper.findAll('a').find((anchor) => anchor.text() === 'Forgot your password?');
        expect(link?.attributes('href')).toBe('/forgot-password');
    });
});
