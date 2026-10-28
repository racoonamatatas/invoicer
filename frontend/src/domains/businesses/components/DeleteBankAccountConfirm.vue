<script setup lang="ts">
// Package imports
import { onMounted, ref, useTemplateRef } from 'vue';

// Project imports
import { deleteBankAccount, type BankAccount } from '@/services/bankAccounts';
import { SessionEndedError } from '@/services/http';

const props = defineProps<{
    businessId: number;
    account: BankAccount;
}>();

// The page closes the confirm on either, and reloads the list after deleted.
const emit = defineEmits<{
    deleted: [];
    cancel: [];
}>();

// Not useForm: a DELETE has no fields and never answers 422, so all this
// needs is "in flight" and "failed".
const isPending = ref(false);
const hasFailed = ref(false);

// Cancel, not Delete for good: the Delete button that opened this is gone,
// and an Enter pressed by reflex should do nothing that can't be undone.
const cancelButton = useTemplateRef<HTMLButtonElement>('cancelButton');

onMounted(() =>
{
    cancelButton.value?.focus();
});

// Re-thrown like a form's failure, so Vue's error handler still sees it. A
// SessionEndedError is swallowed: /login is already loading.
const onConfirm = async (): Promise<void> =>
{
    // Double-click guard, set before the first await.
    if (isPending.value)
    {
        return;
    }

    isPending.value = true;
    hasFailed.value = false;

    try
    {
        await deleteBankAccount(props.businessId, props.account.id);
        emit('deleted');
    }
    catch (error) // unknown: anything can be thrown
    {
        if (error instanceof SessionEndedError)
        {
            return;
        }

        hasFailed.value = true;
        throw error;
    }
    finally
    {
        isPending.value = false;
    }
};
</script>

<template>
    <div role="group" :aria-label="`Delete ${account.label}?`">
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. -->
        <div role="status">
            <p v-if="hasFailed">Couldn't delete.</p>
        </div>

        <p>Delete "{{ account.label }}"?</p>
        <button type="button" :disabled="isPending" @click="onConfirm">Delete for good</button>
        <button ref="cancelButton" type="button" @click="emit('cancel')">Cancel</button>
    </div>
</template>
