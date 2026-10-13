import { describe, it, expect } from 'vitest';

import { AxiosError, AxiosHeaders } from 'axios';
import { parseValidationError } from '@/services/http/validationError';

// Builds the AxiosError a failed request throws. AxiosResponse requires every field
// (statusText, headers, config with AxiosHeaders) under strict types, so each test
// only states the status and body it cares about.
const axiosErrorWith = (status: number, data: unknown) =>
{
    const config = { headers: new AxiosHeaders() };

    return new AxiosError('Request failed', AxiosError.ERR_BAD_REQUEST, config, undefined, {
        data,
        status,
        statusText: '',
        headers: {},
        config,
    });
};

describe('parseValidationError', () =>
{
    it('returns validation for a 422 (unprocessable content) with message and errors', () =>
    {
        // Arrange
        const error = axiosErrorWith(422, {
            message: 'The email field is required.',
            errors: { email: ['The email field is required.'] },
        });

        // Act
        const result = parseValidationError(error);

        // Assert
        expect(result).toStrictEqual({
            kind: 'validation',
            message: 'The email field is required.',
            errors: { email: ['The email field is required.'] },
        });
    });

    it('returns other for a 422 (unprocessable content) without errors', () =>
    {
        // Arrange: what Laravel's abort(422, '...') sends
        const error = axiosErrorWith(422, { message: 'Invoice already sent' });

        // Act
        const result = parseValidationError(error);

        // Assert
        expect(result).toStrictEqual({ kind: 'other' });
    });
});
