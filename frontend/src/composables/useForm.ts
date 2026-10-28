import { computed, readonly, ref } from 'vue';
import { parseFormSubmitFailure } from '@/form/formSubmitFailure';
import type { FormDisplaysFieldError } from '@/form/formDisplaysFieldError';

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

// A field's first error, and the id its input points to with aria-describedby.
// Named, so a component that renders fields for a parent's form can take the
// parent's fieldError as a prop.
export interface FieldError
{
    message: string;
    id: string;
}

// One form's submit state. Each call creates its own refs, so two forms on a
// page never share or clear each other's errors.
// TField lists the form's fields, so a typo in fieldError() is a type error.
// It defaults to never, so a form that leaves it out can't call fieldError()
// at all, instead of falling back to string and accepting any field name.
export const useForm = <TField extends string = never>(formName: string, displaysFieldError: FormDisplaysFieldError<TField>) =>
{
    const errors = ref<Record<string, string[]>>({});
    const message = ref('');
    const throttleMessage = ref('');
    const isPending = ref(false);

    // Runs the page's request. Validation failures land in this form's errors,
    // a 429 in throttleMessage, a 401 that ended the session is swallowed;
    // anything else, a plain 401 included, is re-thrown for the page to handle.
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

            // Swallowed, not re-thrown: the http layer already ended the
            // session and /login is loading, so re-throwing would only reach
            // Vue's error handling on a page that's about to go.
            if (failure.kind === 'sessionEnded')
            {
                return;
            }

            // Shown by the form, so not re-thrown.
            if (failure.kind === 'throttled')
            {
                throttleMessage.value = throttleMessageFor(failure.retryAfterSeconds);

                return;
            }

            errors.value = failure.errors;
            message.value = failure.message;
        }
        finally
        {
            // Runs on success, validation failure and re-throw alike, so the
            // button can never stay disabled.
            isPending.value = false;
        }
    };

    // The one place that decides whether a field has an error, so fieldError()
    // and generalMessage can't disagree. The parser accepts an empty list
    // (`{ email: [] }`), and that has nothing to show, so it counts as none.
    const firstError = (field: string): string | undefined => errors.value[field]?.[0];

    // This field's first error and the id its input points to, or null
    // when the field has no error. Called from the template, so it re-runs
    // whenever errors changes.
    const fieldError = (field: TField): FieldError | null =>
    {
        const message = firstError(field);

        return message === undefined ? null : { message, id: `${formName}-${field}-error` };
    };

    // The 422's message when no field the form displays has an error, so a 422
    // the form has nowhere to show (an empty `errors`, or a key it doesn't
    // render) still tells the user something. '' otherwise, including when
    // there was no 422, because `message` is '' then.
    const generalMessage = computed(() =>
    {
        // <boolean>: TypeScript can't read the value type through the
        // conditional type, so without it `displayed` would be `any`. It's
        // checked, not a cast: the argument must fit Record<string, boolean>.
        const hasDisplayedError = Object.entries<boolean>(displaysFieldError)
            .some(([field, displayed]) => displayed && firstError(field) !== undefined);

        return hasDisplayedError ? '' : message.value;
    });

    // readonly: pages read the state; only submit() writes it. The raw
    // message isn't returned: a page that rendered it would repeat a field's
    // error next to that field. generalMessage is the only way to show it.
    return {
        errors: readonly(errors),
        generalMessage, // a computed, so already read-only
        throttleMessage: readonly(throttleMessage),
        isPending: readonly(isPending),
        submit,
        fieldError,
    };
};
