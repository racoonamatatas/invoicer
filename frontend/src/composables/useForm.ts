import { readonly, ref } from 'vue';
import { parseFormSubmitFailure, type ErrorCode } from '@/form/formSubmitFailure';

// What a form shows for a 429. Built here, so every form says it the same way.
// Rounded up, and at least 1: 30 seconds left reads as 1 minute, and so does
// the 0 Laravel sends when the window ends within the same second.
const throttleMessageFor = (retryAfterSeconds: number | null): string =>
{
    if (retryAfterSeconds === null)
    {
        return 'Too many attempts. Try again later.';
    }

    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

    return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
};

// One form's submit state. Each call creates its own refs, so two forms on a
// page never share or clear each other's errors.
// TField lists the form's fields, so a typo in fieldError() is a type error.
export const useForm = <TField extends string>(formName: string) =>
{
    const errors = ref<Record<string, string[]>>({});
    const message = ref('');
    // Set only by a 422 that carries a known code; null for every other outcome.
    const code = ref<ErrorCode | null>(null);
    const throttleMessage = ref('');
    const isPending = ref(false);

    // Runs the page's request. Validation failures land in this form's errors,
    // a 429 in throttleMessage; anything else is re-thrown for the page to handle.
    const submit = async (send: () => Promise<unknown>): Promise<void> =>
    {
        // Double-submit guard: a second click while a request is in flight does nothing.
        if (isPending.value)
        {
            return;
        }

        // Set before the first await, so a click in the same tick is already blocked.
        isPending.value = true;
        errors.value = {};
        message.value = '';
        code.value = null;
        throttleMessage.value = '';

        try
        {
            await send();
        }
        catch (error) // unknown: anything can be thrown
        {
            const failure = parseFormSubmitFailure(error);

            if (failure.kind === 'other')
            {
                throw error; // the original, so the page sees what really happened
            }

            // Shown by the form, so not re-thrown.
            if (failure.kind === 'throttled')
            {
                throttleMessage.value = throttleMessageFor(failure.retryAfterSeconds);

                return;
            }

            errors.value = failure.errors;
            message.value = failure.message;
            code.value = failure.code;
        }
        finally
        {
            // Runs on success, validation failure and re-throw alike, so the
            // button can never stay disabled.
            isPending.value = false;
        }
    };

    // This field's first error and the id its input points to, or null
    // when the field has no error. Called from the template, so it re-runs
    // whenever errors changes.
    const fieldError = (field: TField): { message: string; id: string } | null =>
    {
        const message = errors.value[field]?.[0];

        return message === undefined ? null : { message, id: `${formName}-${field}-error` };
    };

    // readonly: pages read the state; only submit() writes it.
    return {
        errors: readonly(errors),
        message: readonly(message),
        code: readonly(code),
        throttleMessage: readonly(throttleMessage),
        isPending: readonly(isPending),
        submit,
        fieldError,
    };
};
