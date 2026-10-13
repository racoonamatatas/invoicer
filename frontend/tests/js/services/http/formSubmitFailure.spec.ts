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

    it.for([
        { label: '400 (bad request)', status: 400 },
        // Laravel's status when the session's CSRF token has expired.
        { label: '419 (csrf token mismatch)', status: 419 },
        // Every auth route is throttled.
        { label: '429 (too many requests)', status: 429 },
        { label: '500 (server error)', status: 500 },
    ])('should return an OtherFailure for $label even with a LaravelValidationBody', ({ status }) =>
    {
        // Arrange: a valid body, so only the status can make it an OtherFailure
        const error = axiosErrorWith(status, {
            message: 'The email field is required.',
            errors: { email: ['The email field is required.'] },
        });

        // Act
        const result = parseFormSubmitFailure(error);

        // Assert
        expect(result).toStrictEqual({ kind: 'other' });
    });

    it.for([
        // A bug in the page's own submit function.
        { name: 'plain error', thrown: new Error('boom') },
        // Legal JavaScript: anything can be thrown.
        { name: 'string', thrown: 'boom' },
        // What Promise.reject() with no argument rejects with.
        { name: 'undefined', thrown: undefined },
        // The server was unreachable, so there is no response at all.
        { name: 'network failure', thrown: new AxiosError('Network Error', AxiosError.ERR_NETWORK) },
    ])('should return an OtherFailure for anything thrown that is not an axios error with a response: $name', ({ thrown }) =>
    {
        // Act
        const result = parseFormSubmitFailure(thrown);

        // Assert
        expect(result).toStrictEqual({ kind: 'other' });
    });
});
