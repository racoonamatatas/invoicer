import { isAxiosError } from 'axios';

// What a failed request means for a form. 'validation' is a Laravel 422 whose
// errors can be shown per field; 'other' is everything else (server errors,
// network failures, malformed 422s) and is left to the caller to handle.
// Check `kind` before reading `errors`: TypeScript narrows on it.
export type ValidationResult =
    | { kind: 'validation'; message: string; errors: Record<string, string[]> }
    | { kind: 'other' };

interface LaravelValidationBody
{
    message: string;
    errors: Record<string, string[]>;
}

export const parseValidationError = (error: unknown): ValidationResult =>
{
    if (!isAxiosError(error) || error.response?.status !== 422)
    {
        return { kind: 'other' };
    }

    // TODO: check the body's shape instead of trusting it (tests 2 and 3).
    const body = error.response.data as LaravelValidationBody;

    return { kind: 'validation', message: body.message, errors: body.errors };
};
