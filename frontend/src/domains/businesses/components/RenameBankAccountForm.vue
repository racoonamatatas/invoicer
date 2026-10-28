<script setup lang="ts">
// Package imports
import { computed, onMounted, ref, useTemplateRef } from 'vue';

// Project imports
import { useForm } from '@/composables/useForm';
import { updateBankAccountLabel, type BankAccount, type BankAccountLabelPayload } from '@/services/bankAccounts';

const props = defineProps<{
    businessId: number;
    account: BankAccount;
}>();

// The page closes the form on either, and reloads the list after saved.
const emit = defineEmits<{
    saved: [account: BankAccount];
    cancel: [];
}>();

// Copied once: the page mounts this form only while the row is open.
const form = ref<BankAccountLabelPayload>({ label: props.account.label });

// Not 'bank-account': the add form on the same page uses that, and both have
// a label field, so the error ids would clash.
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof BankAccountLabelPayload>('rename-bank-account', {
    label: true,
});

const labelError = computed(() => fieldError('label'));

// A failure useForm doesn't show: a 404 (the account is gone), a 500, a
// response of the wrong shape. Cleared by the next submit.
const hasFailed = ref(false);

// The Rename button that opened this form is gone, so focus would fall back
// to the page; it goes to the input instead.
const input = useTemplateRef<HTMLInputElement>('input');

onMounted(() =>
{
    input.value?.focus();
});

const onSubmit = async (): Promise<void> =>
{
    hasFailed.value = false;

    try
    {
        await submit(async () =>
        {
            const account = await updateBankAccountLabel(props.businessId, props.account.id, form.value);
            // Last, and not awaited: the page's reload shows its own failure.
            emit('saved', account);
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
    <!-- The current label in the name, so a screen reader can tell the rows'
         forms apart. -->
    <form :aria-label="`Rename ${account.label}`" @submit.prevent="onSubmit">
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
            <p v-else-if="hasFailed">Couldn't save.</p>
        </div>

        <label :for="`rename-bank-account-label-${account.id}`">Label</label>
        <!-- The id carries the account id: only one row is open at a time
             today, but nothing in the DOM should rely on that. -->
        <input
            :id="`rename-bank-account-label-${account.id}`"
            ref="input"
            v-model="form.label"
            type="text"
            required
            :aria-invalid="labelError !== null"
            :aria-describedby="labelError?.id"
        />
        <button type="submit" :disabled="isPending">Save</button>
        <button type="button" @click="emit('cancel')">Cancel</button>
        <p v-if="labelError" :id="labelError.id">{{ labelError.message }}</p>
    </form>
</template>
