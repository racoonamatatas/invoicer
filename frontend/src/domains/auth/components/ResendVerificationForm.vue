<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';

// Project imports
import { resendVerification, type VerificationResend } from '@/services/auth';
import { useForm } from '@/composables/useForm';

// Prefills the email field when the page mounting it already contains the email.
const { initialEmail = '' } = defineProps<{ initialEmail?: string }>();

// The value from `initialEmail` is copied once; afterwards the field belongs to the user
// so a later change to the prop doesn't overwrite what the user typed
const form = ref<VerificationResend>({ email: initialEmail });
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof VerificationResend>('resend-verification', { email: true });

const emailError = computed(() => fieldError('email'));
const isSent = ref(false);

// The flag is set inside the callback: submit() resolves the same way after
// a 422 or a 429, so only reaching that line proves the request was accepted.
// Cleared first, so an earlier success doesn't stay on screen when this send
// is throttled. Inside the callback, so a blocked double click clears nothing.
const onSubmit = () => submit(async () =>
{
    isSent.value = false;
    await resendVerification(form.value.email);
    isSent.value = true;
});
</script>

<template>
    <div>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. The same text for every email,
             so the form reveals nothing about which accounts exist. -->
        <div role="status">
            <p v-if="isSent">If that email has an unverified account, we've sent a new link to it.</p>
            <p v-else-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
        </div>
        <!-- Stays visible after sending, so a mistyped email can be fixed and
             sent again. -->
        <form aria-label="Get a new verification link" @submit.prevent="onSubmit">
            <div>
                <label for="resend-verification-email">Email</label>
                <input
                    id="resend-verification-email"
                    v-model="form.email"
                    type="email"
                    autocomplete="email"
                    :aria-invalid="emailError !== null"
                    :aria-describedby="emailError?.id"
                />
                <p v-if="emailError" :id="emailError.id">{{ emailError.message }}</p>
            </div>
            <button type="submit" :disabled="isPending">Send a new link</button>
        </form>
    </div>
</template>
