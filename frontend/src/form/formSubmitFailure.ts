import { isAxiosError } from 'axios';

import { SessionEndedError } from '@/services/http';

// The codes the backend may send next to a 422's errors, so a form can tell
// two failures apart without matching on message text. Must match the values
// of the backend's ErrorCode enum. A runtime array, not only a type, because
// the parser checks incoming codes against it.
const errorCodes = ['email_not_verified'] as const;

// Derived from the array, so the type and the runtime check can't disagree.
export type ErrorCode = (typeof errorCodes)[number];

// A Laravel 422 whose errors can be shown next to the form's fields.
export interface ValidationFailure
{
    kind: 'validation';
    message: string;
    errors: Record<string, string[]>;
    code: ErrorCode | null; // failures must explicitly state (NOT optionally state) a code or null if they don't have one.
}

// A 429 from Laravel's throttle middleware: too many attempts. Every form
// route is throttled. retryAfterSeconds comes from the Retry-After header,
// or is null when the header is missing or not a number of seconds.
export interface ThrottledFailure
{
    kind: 'throttled';
    retryAfterSeconds: number | null;
}

// A 401 that ended the session: the backend's session was gone (it expired,
// or a password change elsewhere logged this browser out), and the http
// layer's handler has logged the frontend out and is loading /login, so a
// form has nothing to show. A 401 nobody handled is an OtherFailure instead.
export interface SessionEndedFailure
{
    kind: 'sessionEnded';
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
export type FormSubmitFailure = ValidationFailure | ThrottledFailure | SessionEndedFailure | OtherFailure;

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

// Retry-After may also be an HTTP date; Laravel sends whole seconds, so
// anything else (a date, a missing header) becomes null. Response header
// values arrive as strings, so a string of digits is the only shape to read.
const readRetryAfter = (value: unknown): number | null =>
{
    if (typeof value === 'string' && /^\d+$/.test(value))
    {
        return Number(value);
    }

    return null;
};

// Checks if the passed `value` is a known `ErrorCode`.
// Widened to readonly string[]: includes() on the `as const` tuple only
// accepts its own literals, and `value` is any string at this point.
const isErrorCode = (value: unknown): value is ErrorCode =>
{
    return typeof value === 'string' && (errorCodes as readonly string[]).includes(value);
};

// null for a missing key and for an unknown code alike: a code from a newer
// backend is ignored, and the field errors still show.
// `object`, not `unknown`: the caller has already proven the body is one.
const findErrorCode = (data: object): ErrorCode | null =>
{
    return 'code' in data && isErrorCode(data.code) ? data.code : null;
};

// Translates whatever a failed form submit threw into a FormSubmitFailure.
// `error` is unknown because anything can be thrown, not only axios errors.
export const parseFormSubmitFailure = (error: unknown): FormSubmitFailure =>
{
    // Only the http layer creates this, and only after its handler ended the
    // session. A plain 401 falls through to 'other' below.
    if (error instanceof SessionEndedError)
    {
        return { kind: 'sessionEnded' };
    }

    // Axios lowercases response header names, hence 'retry-after'.
    if (isAxiosError(error) && error.response?.status === 429)
    {
        return { kind: 'throttled', retryAfterSeconds: readRetryAfter(error.response.headers['retry-after']) };
    }

    if (!isAxiosError(error) || error.response?.status !== 422)
    {
        return { kind: 'other' };
    }

    const body = error.response.data;

    if (!isLaravelValidationBody(body))
    {
        return { kind: 'other' };
    }

    return { kind: 'validation', message: body.message, errors: body.errors, code: findErrorCode(body) };
};
