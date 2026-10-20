<script setup lang="ts">
// Package imports
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

// Project imports
import { forgotPassword, type PasswordForgot } from '@/services/auth';
import { useForm } from '@/composables/useForm';

const form = ref<PasswordForgot>({ email: '' });
const { submit, isPending, fieldError, throttleMessage } = useForm<keyof PasswordForgot>('forgot-password');

const emailError = computed(() => fieldError('email'));
const isSent = ref(false);

// The confirmation is about the address that was sent. Once the user edits
// it, keeping "we've sent a link to it" on screen would claim a send that
// never happened for the new address.
watch(() => form.value.email, () =>
{
    isSent.value = false;
});

// The flag is set inside the callback: submit() resolves the same way after
// a 422 or a 429, so only reaching that line proves the request was accepted.
// Cleared first, so an earlier success doesn't stay on screen when this send
// is throttled.
const onSubmit = () => submit(async () =>
{
    isSent.value = false;
    await forgotPassword(form.value.email);
    isSent.value = true;
});
</script>

<template>
    <div>
        <h1>Forgot your password?</h1>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. The same text for every email,
             so the page reveals nothing about which accounts exist. -->
        <div role="status">
            <p v-if="isSent">If that email has an account, we've sent a password reset link to it.</p>
            <p v-else-if="throttleMessage">{{ throttleMessage }}</p>
        </div>
        <!-- Stays visible after sending, so a mistyped email can be fixed and
             sent again. -->
        <form aria-label="Send a password reset link" @submit.prevent="onSubmit">
            <div>
                <label for="forgot-password-email">Email</label>
                <input
                    id="forgot-password-email"
                    v-model="form.email"
                    type="email"
                    autocomplete="username"
                    :aria-invalid="emailError !== null"
                    :aria-describedby="emailError?.id"
                />
                <p v-if="emailError" :id="emailError.id">{{ emailError.message }}</p>
            </div>
            <button type="submit" :disabled="isPending">Send reset link</button>
        </form>
        <p><RouterLink :to="{ name: 'login' }">Back to log in</RouterLink></p>
    </div>
</template>
