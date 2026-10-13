import { describe, it, expect } from 'vitest';

import { useForm } from '@/form/useForm';
import { axiosErrorWith } from '../utility/axiosErrorWith';

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
});
