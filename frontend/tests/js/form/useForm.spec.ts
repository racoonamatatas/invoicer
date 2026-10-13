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
        const form = useForm();

        // Act: would throw, and fail the test, if submit re-threw a validation failure
        await form.submit(sendFailingWith422);

        // Assert
        expect(form.errors.value).toStrictEqual({ email: ['The email field is required.'] });
        expect(form.message.value).toBe('The email field is required.');
    });

    it('should clear errors and message when the next submit succeeds', async () =>
    {
        // Arrange: a first submit that leaves errors and a message behind
        const form = useForm();
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
        const form = useForm();
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
        const form = useForm();
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
        const login = useForm();
        const resend = useForm();
        await login.submit(sendFailingWith422);

        // Act: the user clicks resend, the request the old global bag cleared errors on
        await resend.submit(sendSucceeding);

        // Assert: login still shows its error, and resend never had one
        expect(login.errors.value).toStrictEqual({ email: ['The email field is required.'] });
        expect(login.message.value).toBe('The email field is required.');
        expect(resend.errors.value).toStrictEqual({});
    });
});
