import { isAxiosError } from 'axios';

// A Laravel 422 whose errors can be shown next to the form's fields.
export interface ValidationFailure
{
    kind: 'validation';
    message: string;
    errors: Record<string, string[]>;
}

// Everything else (server errors, network failures, malformed 422s). The form
// can't show it per field, so it is left to the caller to handle.
export interface OtherFailure
{
    kind: 'other';
}

// Why a form submit failed, as a form sees it. Other contexts (loading a page,
// say) would split failures differently, hence the form-specific name.
// Plain data that is returned, not an Error subclass that is thrown.
// Check `kind` before reading `errors`: TypeScript narrows on it.
export type FormSubmitFailure = ValidationFailure | OtherFailure;

// The body Laravel's validator sends with a 422. Kept private: only this file
// knows Laravel's format; everything else uses FormSubmitFailure.
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

// Translates whatever a failed form submit threw into a FormSubmitFailure.
// `error` is unknown because anything can be thrown, not only axios errors.
export const parseFormSubmitFailure = (error: unknown): FormSubmitFailure =>
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
