import { describe, it, expect, vi } from 'vitest';

import { useForm } from '@/form/useForm';
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

// A send that succeeds, as a request does once the user has fixed the field.
const sendSucceeding = () => Promise.resolve();

describe('useForm', () =>
{
    it('should fill errors and message when the request fails with a 422 (unprocessable)', async () =>
    {
        // Arrange
        const form = useForm('login');

        // Act: would throw, and fail the test, if submit re-threw a validation failure
        await form.submit(sendFailingWith422);

        // Assert
        expect(form.errors.value).toStrictEqual({ email: ['The email field is required.'] });
        expect(form.message.value).toBe('The email field is required.');
    });

    it('should clear errors and message when the next submit succeeds', async () =>
    {
        // Arrange: a first submit that leaves errors and a message behind
        const form = useForm('login');
        await form.submit(sendFailingWith422);

        // Act
        await form.submit(sendSucceeding);

        // Assert
        expect(form.errors.value).toStrictEqual({});
        expect(form.message.value).toBe('');
    });

    it('should re-throw the original error and reset isPending when the request fails with a 500 (server error)', async () =>
    {
        // Arrange: an OtherFailure, which the form can't show per field
        const form = useForm('login');
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
        const form = useForm('login');
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
        const login =  useForm('login');
        const resend =  useForm('resend');
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
        const form = useForm('login');

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
        const form = useForm('login');

        // Act: the 422 only has an error for email
        await form.submit(sendFailingWith422);

        // Assert: password has nothing to show, so its input gets no aria attributes
        expect(form.fieldError('password')).toBeNull();
    });

    it('should return only the first message when the 422 (unprocessable) has several for a field', async () =>
    {
        // Arrange: Laravel sends one message per failed rule
        const form = useForm('register');
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

    it('should fail type-check when fieldError gets a field the form does not have', () =>
    {
        // Arrange
        const form = useForm<'email' | 'password'>('login');

        // Assert: checked by npm run type-check, not by vitest. If the typo
        // compiles, the directive is unused and type-check fails instead.
        // @ts-expect-error 'emial' is not 'email' | 'password'
        form.fieldError('emial');
    });
});
