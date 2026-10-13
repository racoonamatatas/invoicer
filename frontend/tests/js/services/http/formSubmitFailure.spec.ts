import { describe, it, expect } from 'vitest';

import { AxiosError, AxiosHeaders } from 'axios';
import { parseFormSubmitFailure } from '@/services/http/formSubmitFailure';

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

describe('parseFormSubmitFailure', () =>
{
    it('should return a ValidationFailure with the message and errors of a 422 (unprocessable) LaravelValidationBody', () =>
    {
        // Arrange
        const error = axiosErrorWith(422, {
            message: 'The email field is required.',
            errors: { email: ['The email field is required.'] },
        });

        // Act
        const result = parseFormSubmitFailure(error);

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
    ])('should return an OtherFailure when a 422 (unprocessable) body is not a LaravelValidationBody: $name', ({ body }) =>
    {
        // Arrange
        const error = axiosErrorWith(422, body);

        // Act
        const result = parseFormSubmitFailure(error);

        // Assert
        expect(result).toStrictEqual({ kind: 'other' });
    });
});
