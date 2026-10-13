import { readonly, ref } from 'vue';
import { parseFormSubmitFailure } from './formSubmitFailure';

// One form's submit state. Each call creates its own refs, so two forms on a
// page never share or clear each other's errors.
export const useForm = () =>
{
    const errors = ref<Record<string, string[]>>({});
    const message = ref('');
    const isPending = ref(false);

    // Runs the page's request. Validation failures land in this form's errors;
    // anything else is re-thrown for the page to handle.
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

    // readonly: pages read the state; only submit() writes it.
    return {
        errors: readonly(errors),
        message: readonly(message),
        isPending: readonly(isPending),
        submit,
    };
};
