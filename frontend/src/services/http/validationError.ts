import { isAxiosError } from 'axios';

// What a failed request means for a form. 'validation' is a Laravel 422 whose
// errors can be shown per field; 'other' is everything else (server errors,
// network failures, malformed 422s) and is left to the caller to handle.
// Check `kind` before reading `errors`: TypeScript narrows on it.
export type ValidationResult =
    | { kind: 'validation'; message: string; errors: Record<string, string[]> }
    | { kind: 'other' };

// The body Laravel's validator sends with a 422. Kept private: only this file
// knows Laravel's format; everything else uses ValidationResult.
interface LaravelValidationBody
{
    message: string;
    errors: Record<string, string[]>;
}

// The response body is whatever arrived over the network, so it is checked at
// runtime. TypeScript trusts the `data is` claim without verifying it: these
// checks must match the interface above, and the tests are what prove they do.
const isLaravelValidationBody = (data: unknown): data is LaravelValidationBody =>
{
    return typeof data === 'object'
           && data !== null // typeof null is 'object'
           && 'message' in data
           && typeof data.message === 'string'
           && 'errors' in data
           && typeof data.errors === 'object'
           && data.errors !== null
           && !Array.isArray(data.errors) // typeof [] is 'object' too
           // Every field maps to a list of messages: { email: ['...'] }.
           && Object.values(data.errors).every((value: unknown) =>
               Array.isArray(value) && value.every((item: unknown) => typeof item === 'string'));
};

// Translates whatever a failed request threw into a ValidationResult. `error` is
// unknown because anything can be thrown, not only axios errors.
export const parseValidationError = (error: unknown): ValidationResult =>
{
    if (!isAxiosError(error) || error.response?.status !== 422)
    {
        return { kind: 'other' };
    }

    const body = error.response.data;

    if (!isLaravelValidationBody(body))
    {
        return { kind: 'other' };
    }

    return { kind: 'validation', message: body.message, errors: body.errors };
};
