<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';

// Project imports
import { useForm } from '@/composables/useForm';
import { createBankAccount, type BankAccount, type BankAccountPayload } from '@/services/bankAccounts';

// The page keys this form by businessId, so another business starts empty.
const props = defineProps<{
    businessId: number;
}>();

// An emit, not a save prop like BusinessForm's: the form makes the request
// itself, and what follows (the page's reload) shows its own failure, so the
// form never has to await it.
const emit = defineEmits<{
    added: [account: BankAccount];
}>();

const emptyFields = (): BankAccountPayload => ({ iban: '', label: '' });

const form = ref<BankAccountPayload>(emptyFields());

const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof BankAccountPayload>('bank-account', {
    iban: true,
    label: true,
});

const ibanError = computed(() => fieldError('iban'));
const labelError = computed(() => fieldError('label'));

// Both cleared by the next submit, so neither stands next to that attempt's
// outcome. A failure useForm doesn't show (a 404, a 500, a response of the
// wrong shape) would otherwise leave the button re-enabled with no word why.
const isAdded = ref(false);
const hasFailed = ref(false);

// Cleared only inside the callback: submit() resolves the same way after a
// 422, and a 422 must leave what the user typed in the inputs.
const onSubmit = async (): Promise<void> =>
{
    isAdded.value = false;
    hasFailed.value = false;

    try
    {
        await submit(async () =>
        {
            // As typed: the backend strips spaces and uppercases the IBAN.
            const account = await createBankAccount(props.businessId, form.value);
            form.value = emptyFields();
            isAdded.value = true;
            // Last, and not awaited: see the emit's comment.
            emit('added', account);
        });
    }
    catch (error) // unknown: anything can be thrown
    {
        hasFailed.value = true;
        throw error;
    }
};
</script>

<template>
    <!-- required repeats the backend's required rules, so an empty field is
         caught by the browser instead of costing a request. -->
    <form aria-label="Add a bank account" @submit.prevent="onSubmit">
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
            <p v-else-if="hasFailed">Couldn't add.</p>
            <p v-else-if="isAdded">Added.</p>
        </div>

        <div>
            <label for="bank-account-iban">IBAN</label>
            <!-- No pattern or maxlength: spaces and lowercase are fine, and
                 the backend is the only judge of an IBAN. autocapitalize
                 only helps a phone keyboard. -->
            <input
                id="bank-account-iban"
                v-model="form.iban"
                type="text"
                required
                autocomplete="off"
                spellcheck="false"
                autocapitalize="characters"
                :aria-invalid="ibanError !== null"
                :aria-describedby="ibanError?.id"
            />
            <p v-if="ibanError" :id="ibanError.id">{{ ibanError.message }}</p>
        </div>
        <div>
            <label for="bank-account-label">Label</label>
            <input
                id="bank-account-label"
                v-model="form.label"
                type="text"
                required
                :aria-invalid="labelError !== null"
                :aria-describedby="labelError?.id"
            />
            <p v-if="labelError" :id="labelError.id">{{ labelError.message }}</p>
        </div>

        <button type="submit" :disabled="isPending">Add</button>
    </form>
</template>
