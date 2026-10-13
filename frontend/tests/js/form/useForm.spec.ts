import { describe, it, expect } from 'vitest';

import { useForm } from '@/form/useForm';
import { axiosErrorWith } from '../utility/axiosErrorWith';

describe('useForm', () =>
{
    it('should fill errors and message when the request fails with a 422 (unprocessable)', async () =>
    {
        // Arrange: send fails the way postRequest does on a Laravel validation error
        const form = useForm();
        const send = async () =>
        {
            throw axiosErrorWith(422, {
                message: 'The email field is required.',
                errors: { email: ['The email field is required.'] },
            });
        };

        // Act: would throw, and fail the test, if submit re-threw a validation failure
        await form.submit(send);

        // Assert
        expect(form.errors.value).toStrictEqual({ email: ['The email field is required.'] });
        expect(form.message.value).toBe('The email field is required.');
    });
});
