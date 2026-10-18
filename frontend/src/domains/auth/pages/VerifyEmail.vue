<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

// Project imports
import { verifyEmail, type EmailVerification } from '@/services/auth';
import { useForm } from '@/composables/useForm';
import ResendVerificationForm from '@/domains/auth/components/ResendVerificationForm.vue';

const route = useRoute();
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '');

const { submit, isPending, fieldError, throttleMessage } = useForm<keyof EmailVerification>('verify-email');
const isVerified = ref(false);
const tokenError = computed(() => fieldError('token'));

// Posted on click, never on load: the token works once, so a refresh or a
// mail scanner would otherwise spend it. The flag is set inside the callback:
// submit() resolves the same way after a 422, so only reaching that line
// proves the email was verified.
const onVerify = () => submit(async () =>
{
    await verifyEmail(token.value);
    isVerified.value = true;
});
</script>

<template>
    <div>
        <h1>Verify your email</h1>

        <!-- Always rendered, so a screen reader announces whichever outcome
             appears after the click. -->
        <div role="status">
            <p v-if="isVerified">Your email is verified. <RouterLink :to="{ name: 'login' }">Log in</RouterLink></p>
            <p v-else-if="tokenError" :id="tokenError.id">{{ tokenError.message }}</p>
            <!-- The token wasn't checked, so it may still be good: the button
                 stays for a retry once the wait is over. -->
            <p v-else-if="throttleMessage">{{ throttleMessage }}</p>
        </div>

        <p v-if="!token">This link is incomplete. Open the link from your email again.</p>
        <!-- Hidden after a 422: a used or expired token can't start working. -->
        <button v-else-if="!isVerified && !tokenError" type="button" :disabled="isPending" @click="onVerify">Verify my email</button>

        <!-- A link without a token needs a new mail as much as an expired one.
             The heading lives here, not in the form: its level depends on the page. -->
        <template v-if="!token || tokenError">
            <h2>Get a new link</h2>
            <ResendVerificationForm />
        </template>
    </div>
</template>
