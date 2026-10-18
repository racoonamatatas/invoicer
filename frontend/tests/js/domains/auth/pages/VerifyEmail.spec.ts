import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMemoryHistory, createRouter, type LocationQueryRaw } from 'vue-router';

import { authRoutes } from '@/domains/auth/routes';
import VerifyEmail from '@/domains/auth/pages/VerifyEmail.vue';
import * as auth from '@/services/auth';
import { axiosErrorWith } from '../../../utility/axiosErrorWith';
import { createDeferred } from '../../../utility/createDeferred';

// Every export of the auth service becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/auth');

const token = 'a1b2c3d4e5f6';
const invalidLink = 'This verification link is invalid or has expired.';

// Mounts VerifyEmail on /verify-email with the app's real routes and the given
// query, the way the link in the mail opens it. The memory history is a fake:
// a working in-memory stand-in for the browser's address bar. VerifyEmail
// uses no store, so no Pinia.
const mountVerifyEmail = async (query: LocationQueryRaw = { token }, errorHandler?: (error: unknown) => void) =>
{
    const router = createRouter({
        history: createMemoryHistory(),
        routes: authRoutes.map((route) => route.toRecord()),
    });
    await router.push({ name: 'verifyEmail', query });

    return mount(VerifyEmail, { global: { plugins: [router], config: { errorHandler } } });
};

type Wrapper = Awaited<ReturnType<typeof mountVerifyEmail>>;

const findVerifyButton = (wrapper: Wrapper) => wrapper.find('button[type="button"]');
const findResendForm = (wrapper: Wrapper) => wrapper.find('form[aria-label="Get a new verification link"]');

describe('VerifyEmail page', () =>
{
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should not post the token when the link is opened, and offer the verify button instead', async () =>
    {
        // Arrange + Act: open the link, and nothing else
        const wrapper = await mountVerifyEmail();
        await flushPromises();

        // Assert: the token is still unspent, and the button offers to spend it
        expect(auth.verifyEmail).not.toHaveBeenCalled();
        // The button is enough to show the page is waiting for the click: it
        // only renders while the token is present, not yet verified and not
        // rejected, so neither outcome of a post has been reached
        expect(findVerifyButton(wrapper).text()).toBe('Verify my email');
    });

    it('should post the token from the link and show the verified message with a login link when verifyEmail gets a 204 (no content)', async () =>
    {
        // Arrange: auth.verifyEmail is a stub (resolves) and a spy (records its call)
        vi.mocked(auth.verifyEmail).mockResolvedValue();
        const wrapper = await mountVerifyEmail();

        // Act
        await findVerifyButton(wrapper).trigger('click');
        await flushPromises();

        // Assert (interaction): the token from the link reached the request
        expect(auth.verifyEmail).toHaveBeenCalledExactlyOnceWith(token);

        // Assert (outcome): the message sits in the live region and links to login
        const status = wrapper.find('[role="status"]');
        expect(status.text()).toContain('Your email is verified.');
        expect(status.find('a').attributes('href')).toBe('/login');

        // Assert: nothing is left to do, so no button and no resend form
        expect(findVerifyButton(wrapper).exists()).toBe(false);
        expect(findResendForm(wrapper).exists()).toBe(false);
    });

    it('should show the invalid-link message, hide the verify button and offer a new link when verifyEmail fails with a 422 (unprocessable)', async () =>
    {
        // Arrange: auth.verifyEmail is a stub that fails the way the backend
        // does for a used or expired token
        vi.mocked(auth.verifyEmail).mockRejectedValue(axiosErrorWith(422, { message: invalidLink, errors: { token: [invalidLink] } }));
        const wrapper = await mountVerifyEmail();

        // Act
        await findVerifyButton(wrapper).trigger('click');
        await flushPromises();

        // Assert: the message sits in the live region, under the id useForm gives it
        const message = wrapper.find('#verify-email-token-error');
        expect(message.text()).toBe(invalidLink);
        expect(wrapper.find('[role="status"]').element.contains(message.element)).toBe(true);

        // Assert: the dead token can't be retried, and a new link is offered instead
        expect(findVerifyButton(wrapper).exists()).toBe(false);
        expect(wrapper.find('h2').text()).toBe('Get a new link');
        expect(findResendForm(wrapper).exists()).toBe(true);
    });

    // A repeated ?token= arrives as an array, which the page can't post either,
    // so it counts as incomplete just like a missing one.
    it.for([
        { name: 'missing', query: {} },
        { name: 'empty', query: { token: '' } },
        { name: 'repeated', query: { token: [token, token] } },
    ])('should say the link is incomplete and offer a new link instead of a verify button when the token is $name', async ({ query }) =>
    {
        // Arrange + Act: open the link, and nothing else
        const wrapper = await mountVerifyEmail(query);
        await flushPromises();

        // Assert: no button to click, so the user can't post
        expect(wrapper.text()).toContain('This link is incomplete. Open the link from your email again.');
        expect(findVerifyButton(wrapper).exists()).toBe(false);

        // Assert: and the page didn't post on its own when it opened
        expect(auth.verifyEmail).not.toHaveBeenCalled();

        // Assert: a new link is offered instead
        expect(wrapper.find('h2').text()).toBe('Get a new link');
        expect(findResendForm(wrapper).exists()).toBe(true);
    });

    it('should disable the verify button while verifyEmail is in flight', async () =>
    {
        // Arrange: auth.verifyEmail is a stub whose request the test finishes by hand
        const request = createDeferred();
        vi.mocked(auth.verifyEmail).mockReturnValue(request.promise.then(() => undefined));
        const wrapper = await mountVerifyEmail();
        const button = findVerifyButton(wrapper);

        // Assert: usable before anything is sent
        expect(button.attributes('disabled')).toBeUndefined();

        // Act
        await button.trigger('click');

        // Assert: disabled while the request is in flight
        expect(button.attributes('disabled')).toBeDefined();

        // Act: the request finishes
        request.resolve();
        await flushPromises();

        // Assert: the button made way for the verified message
        expect(findVerifyButton(wrapper).exists()).toBe(false);
        expect(wrapper.find('[role="status"]').text()).toContain('Your email is verified.');
    });

    it('should hand the original error to the app error handler and keep the verify button usable when verifyEmail fails with a 500 (server error)', async () =>
    {
        // Arrange: auth.verifyEmail is a stub that fails with an error no field
        // can show. errorHandler is a spy standing in for app.config.errorHandler,
        // where Vue sends a rejected promise returned by an event handler
        const error = axiosErrorWith(500, { message: 'Server Error' });
        vi.mocked(auth.verifyEmail).mockRejectedValue(error);
        const errorHandler = vi.fn<(error: unknown) => void>();
        const wrapper = await mountVerifyEmail({ token }, errorHandler);

        // Act
        await findVerifyButton(wrapper).trigger('click');
        await flushPromises();

        // Assert (interaction): the page didn't swallow the error or wrap it
        expect(errorHandler).toHaveBeenCalledOnce();
        expect(errorHandler.mock.calls[0]?.[0]).toBe(error);

        // Assert (outcome): the token may still be good, so the button stays
        // and no new link is pushed on the user
        expect(findVerifyButton(wrapper).exists()).toBe(true);
        expect(findVerifyButton(wrapper).attributes('disabled')).toBeUndefined();
        expect(findResendForm(wrapper).exists()).toBe(false);
    });
});
