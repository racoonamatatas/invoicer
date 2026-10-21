import { describe, it, expect, vi } from 'vitest';

import { useForm } from '@/composables/useForm';
import { axiosErrorWith } from '../utility/axiosErrorWith';
import { createDeferred } from '../utility/createDeferred';

// A send that fails the way postRequest does on a Laravel validation error.
const sendFailingWith422 = async () =>
{
    throw axiosErrorWith(422, {
        message: 'The email field is required.',
        errors: { email: ['The email field is required.'] },
    });
};

// A send that fails the way the backend's login does for an unverified email.
const sendFailingWithUnverified422 = async () =>
{
    throw axiosErrorWith(422, {
        message: 'Verify your email before logging in.',
        errors: { email: ['Verify your email before logging in.'] },
        code: 'email_not_verified',
    });
};

// A send that succeeds, as a request does once the user has fixed the field.
const sendSucceeding = () => Promise.resolve();

describe('useForm', () =>
{
    it('should fill errors and message when the request fails with a 422 (unprocessable)', async () =>
    {
        // Arrange
        const form = useForm('login', {});

        // Act: would throw, and fail the test, if submit re-threw a validation failure
        await form.submit(sendFailingWith422);

        // Assert
        expect(form.errors.value).toStrictEqual({ email: ['The email field is required.'] });
        expect(form.message.value).toBe('The email field is required.');
    });

    it('should clear errors and message when the next submit succeeds', async () =>
    {
        // Arrange: a first submit that leaves errors and a message behind
        const form = useForm('login', {});
        await form.submit(sendFailingWith422);

        // Act
        await form.submit(sendSucceeding);

        // Assert
        expect(form.errors.value).toStrictEqual({});
        expect(form.message.value).toBe('');
    });

    it('should set code when the request fails with a 422 (unprocessable) that carries email_not_verified', async () =>
    {
        // Arrange
        const form = useForm('login', {});

        // Act: the real parser runs, so this also proves the parser and useForm connect
        await form.submit(sendFailingWithUnverified422);

        // Assert
        expect(form.code.value).toBe('email_not_verified');
    });

    it('should clear code when the next submit succeeds', async () =>
    {
        // Arrange: a first submit that leaves a code behind
        const form = useForm('login', {});
        await form.submit(sendFailingWithUnverified422);

        // Act: a success, not a plain 422: the 422 branch would overwrite code
        // with null itself, so only a success proves the reset at the start
        await form.submit(sendSucceeding);

        // Assert
        expect(form.code.value).toBeNull();
    });

    it('should re-throw the original error and reset isPending when the request fails with a 500 (server error)', async () =>
    {
        // Arrange: an OtherFailure, which the form can't show per field
        const form = useForm('login', {});
        const error = axiosErrorWith(500, { message: 'Server Error' });
        const send = () => Promise.reject(error);

        // Act + Assert: the same error instance reaches the page, not a copy or an OtherFailure
        await expect(form.submit(send)).rejects.toBe(error);

        // Assert: the button is usable again after a failure the page handles
        expect(form.isPending.value).toBe(false);
    });

    it('should ignore a second submit while the first request is in flight', async () =>
    {
        // Arrange: a request the test finishes by hand, so it can look while it is in flight
        const form = useForm('login', {});
        const request = createDeferred();
        const send = vi.fn(() => request.promise);

        // Act: a double click, both submits in the same tick
        const first = form.submit(send);
        const second = form.submit(send);

        // Assert: only one request went out, and the form shows it is busy
        expect(send).toHaveBeenCalledTimes(1);
        expect(form.isPending.value).toBe(true);

        // Act: the request finishes
        request.resolve();
        await Promise.all([first, second]);

        // Assert: still one request, and the form is usable again
        expect(send).toHaveBeenCalledTimes(1);
        expect(form.isPending.value).toBe(false);
    });

    it('should keep a form\'s errors when another form on the page submits', async () =>
    {
        // Arrange: the login page's two forms; login failed validation
        const login =  useForm('login', {});
        const resend =  useForm('resend', {});
        await login.submit(sendFailingWith422);

        // Act: the user clicks resend, the request the old global bag cleared errors on
        await resend.submit(sendSucceeding);

        // Assert: login still shows its error, and resend never had one
        expect(login.errors.value).toStrictEqual({ email: ['The email field is required.'] });
        expect(login.message.value).toBe('The email field is required.');
        expect(resend.errors.value).toStrictEqual({});
    });

    it('should return a field\'s error and an id prefixed with the form name after a 422 (unprocessable)', async () =>
    {
        // Arrange
        const form = useForm<'email' | 'password'>('login', { email: true, password: true });

        // Act
        await form.submit(sendFailingWith422);

        // Assert: the id is what the input's aria-describedby will point at
        expect(form.fieldError('email')).toStrictEqual({
            message: 'The email field is required.',
            id: 'login-email-error',
        });
    });

    it('should return null for a field the 422 (unprocessable) has no error for', async () =>
    {
        // Arrange
        const form = useForm<'email' | 'password'>('login', { email: true, password: true });

        // Act: the 422 only has an error for email
        await form.submit(sendFailingWith422);

        // Assert: password has nothing to show, so its input gets no aria attributes
        expect(form.fieldError('password')).toBeNull();
    });

    it('should return only the first message when the 422 (unprocessable) has several for a field', async () =>
    {
        // Arrange: Laravel sends one message per failed rule
        const form = useForm<'password'>('register', { password: true });
        const send = () => Promise.reject(axiosErrorWith(422, {
            message: 'The password field must be at least 8 characters. (and 1 more error)',
            errors: {
                password: [
                    'The password field must be at least 8 characters.',
                    'The password field must contain at least one number.',
                ],
            },
        }));

        // Act
        await form.submit(send);

        // Assert: one message under the input, not a list
        expect(form.fieldError('password')?.message).toBe('The password field must be at least 8 characters.');
    });

    // Rounded up, so a few seconds left never reads as 0 minutes. Laravel sends 0
    // when the window ends within the same second. 3120 seconds is 52 minutes,
    // a wait the hourly mail-per-email limit can produce.
    it.for([
        { name: '0 seconds', retryAfter: '0', throttleMessage: 'Too many attempts. Try again in 1 minute.' },
        { name: '30 seconds', retryAfter: '30', throttleMessage: 'Too many attempts. Try again in 1 minute.' },
        { name: '60 seconds', retryAfter: '60', throttleMessage: 'Too many attempts. Try again in 1 minute.' },
        { name: '61 seconds', retryAfter: '61', throttleMessage: 'Too many attempts. Try again in 2 minutes.' },
        { name: '3120 seconds', retryAfter: '3120', throttleMessage: 'Too many attempts. Try again in 52 minutes.' },
        { name: 'no Retry-After', retryAfter: null, throttleMessage: 'Too many attempts. Try again later.' },
    ])('should set throttleMessage and not re-throw when the request fails with a 429 (too many requests): $name', async ({ retryAfter, throttleMessage }) =>
    {
        // Arrange: a send that fails the way Laravel's throttle middleware does
        const form = useForm('resend-verification', {});
        const headers: Record<string, string> = retryAfter === null ? {} : { 'retry-after': retryAfter };
        const send = () => Promise.reject(axiosErrorWith(429, { message: 'Too Many Attempts.' }, headers));

        // Act: would throw, and fail the test, if submit re-threw a 429
        await form.submit(send);

        // Assert
        expect(form.throttleMessage.value).toBe(throttleMessage);
    });

    it('should clear throttleMessage when the next submit starts', async () =>
    {
        // Arrange: a first submit that was throttled, and a second request
        // the test holds open, to look before it settles
        const form = useForm('resend-verification', {});
        await form.submit(() => Promise.reject(axiosErrorWith(429, { message: 'Too Many Attempts.' }, { 'retry-after': '60' })));
        const request = createDeferred();

        // Act
        const second = form.submit(() => request.promise);

        // Assert: cleared as soon as the user tries again, not only on success
        expect(form.throttleMessage.value).toBe('');

        // Act: let the request finish, so nothing is left pending after the test
        request.resolve();
        await second;
    });

    it('should set generalMessage to the message when a 422 (unprocessable) has an empty errors', async () =>
    {
        // Arrange: a well-formed 422 with no field to point at, e.g. a generic
        // ValidationException on the backend
        const form = useForm<'email' | 'password'>('login', { email: true, password: true });
        const send = () => Promise.reject(axiosErrorWith(422, { message: 'The given data was invalid.', errors: {} }));

        // Act
        await form.submit(send);

        // Assert
        expect(form.generalMessage.value).toBe('The given data was invalid.');
    });

    it('should set generalMessage to the message when a 422 (unprocessable) only has an error the form does not display', async () =>
    {
        // Arrange: register sends password_confirmation but has no place on
        // the page for its error, so it is marked false
        const form = useForm<'password' | 'password_confirmation'>('register', { password: true, password_confirmation: false });
        const send = () => Promise.reject(axiosErrorWith(422, {
            message: 'The password confirmation field is required.',
            errors: { password_confirmation: ['The password confirmation field is required.'] },
        }));

        // Act
        await form.submit(send);

        // Assert
        expect(form.generalMessage.value).toBe('The password confirmation field is required.');
    });

    it('should leave generalMessage empty when a 422 (unprocessable) has an error the form displays', async () =>
    {
        // Arrange
        const form = useForm<'email' | 'password'>('login', { email: true, password: true });

        // Act
        await form.submit(sendFailingWith422);

        // Assert: the 422 arrived, so the empty generalMessage is a decision,
        // not a response that never landed. The error shows next to email,
        // so showing the message too would repeat it.
        expect(form.message.value).toBe('The email field is required.');
        expect(form.generalMessage.value).toBe('');
    });

    it('should clear generalMessage when the next submit succeeds', async () =>
    {
        // Arrange: a first submit that leaves a general message behind
        const form = useForm<'email' | 'password'>('login', { email: true, password: true });
        await form.submit(() => Promise.reject(axiosErrorWith(422, { message: 'The given data was invalid.', errors: {} })));

        // Act
        await form.submit(sendSucceeding);

        // Assert
        expect(form.generalMessage.value).toBe('');
    });

    it('should fail type-check when fieldError gets a field the form does not have', () =>
    {
        // Arrange
        const form = useForm<'email' | 'password'>('login', { email: true, password: true });

        // Assert: checked by npm run type-check, not by vitest. If the typo
        // compiles, the directive is unused and type-check fails instead.
        // @ts-expect-error 'emial' is not 'email' | 'password'
        form.fieldError('emial');
    });

    it('should fail type-check when the fields leave out one of the form\'s fields', () =>
    {
        // Assert: checked by npm run type-check, not by vitest. Every field
        // needs a true or false, so a forgotten one can't count as displayed.
        // @ts-expect-error password is missing
        useForm<'email' | 'password'>('login', { email: true });
    });

    it('should fail type-check when useForm gets fields but no generic', () =>
    {
        // Assert: checked by npm run type-check, not by vitest. Without the
        // generic, TField is never; the fields must then be {}, or a form
        // could list fields that fieldError() would never accept.
        // @ts-expect-error email can't be a field when TField is never
        useForm('login', { email: true });
    });
});
