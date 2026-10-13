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

const isLaravelValidationBody = (data: unknown): data is LaravelValidationBody =>
{
    return typeof data === 'object'
           && data !== null
           && 'message' in data
           && typeof data.message === 'string'
           && 'errors' in data
           && typeof data.errors === 'object'
           && data.errors !== null;
};

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
