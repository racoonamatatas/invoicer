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

    it.for([
        // What Laravel's abort(422, '...') sends.
        { name: 'no errors', body: { message: 'Invoice already sent' } },
        { name: 'errors values not arrays', body: { message: 'Invalid.', errors: { email: 'Required.' } } },
        { name: 'errors values not strings', body: { message: 'Invalid.', errors: { email: [42] } } },
        { name: 'errors is an array', body: { message: 'Invalid.', errors: [] } },
        { name: 'no message', body: { errors: { email: ['Required.'] } } },
        // What a proxy or maintenance page sends.
        { name: 'not an object', body: '<html>Service Unavailable</html>' },
    ])('returns other for a 422 (unprocessable content) whose body is not Laravel\'s validation shape: $name', ({ body }) =>
    {
        // Arrange
        const error = axiosErrorWith(422, body);

        // Act
        const result = parseValidationError(error);

        // Assert
        expect(result).toStrictEqual({ kind: 'other' });
    });
});
