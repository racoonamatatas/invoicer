<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

// Project imports
import { resetPassword, type PasswordReset } from '@/services/auth';
import { useAuthStore } from '@/domains/auth/store';
import { useForm } from '@/composables/useForm';

const route = useRoute();
const router = useRouter();
const store = useAuthStore();

// Read once, not as computeds: after success the URL is cleared on purpose,
// and the page must not then read as an incomplete link.
const token = typeof route.query.token === 'string' ? route.query.token : '';
const email = typeof route.query.email === 'string' ? route.query.email : '';

// Only the fields the user types; token and email come from the link.
const form = ref<Pick<PasswordReset, 'password' | 'password_confirmation'>>({ password: '', password_confirmation: '' });
const { submit, isPending, fieldError, throttleMessage } = useForm<keyof PasswordReset>('reset-password');
const isReset = ref(false);

// Laravel's 'confirmed' rule reports a mismatch under password, not under
// password_confirmation, so one error slot covers both fields.
const passwordError = computed(() => fieldError('password'));
// token and email aren't inputs, so their errors can't sit next to one. Either
// means the link itself is bad, and the fix is the same: request a new one.
const linkError = computed(() => fieldError('token') ?? fieldError('email'));

// The flag is set inside the callback: submit() resolves the same way after
// a 422, so only reaching that line proves the password was changed.
// After success the token and email are removed from the URL, so they don't
// stay in the history or leak to the next page. Set the flag first: the
// password is changed even if the URL change fails.
// The reset deleted every session of the account, this browser's included,
// so a user who was logged in here is now logged out: the store is told,
// or authGuard would keep opening protected routes until the next 401.
const onSubmit = () => submit(async () =>
{
    await resetPassword({ token, email, ...form.value });
    isReset.value = true;
    store.clear();
    // Caught, not left to submit(): it would hand a rejection to the app's
    // error handler, and an error page after a reset that worked would read as
    // a failed reset. Losing the cleanup only leaves a spent token in the URL.
    await router.replace({ name: 'resetPassword' }).catch(() => undefined);
});
</script>

<template>
    <div>
        <h1>Choose a new password</h1>

        <!-- Always rendered, so a screen reader announces whichever outcome
             appears after submitting. -->
        <div role="status">
            <p v-if="isReset">Your password is changed. <RouterLink :to="{ name: 'login' }">Log in</RouterLink></p>
            <p v-else-if="linkError" :id="linkError.id">
                {{ linkError.message }}
                <RouterLink :to="{ name: 'forgotPassword' }">Request a new link</RouterLink>
            </p>
            <!-- The token wasn't checked, so it may still be good: the form
                 stays for a retry once the wait is over. -->
            <p v-else-if="throttleMessage">{{ throttleMessage }}</p>
        </div>

        <p v-if="!token || !email">
            This link is incomplete. Open the link from your email again, or
            <RouterLink :to="{ name: 'forgotPassword' }">request a new link</RouterLink>.
        </p>
        <!-- Hidden after success, and after a bad link: a used or expired token
             can't start working. -->
        <form v-else-if="!isReset && !linkError" aria-label="Choose a new password" @submit.prevent="onSubmit">
            <!-- Read-only, so the user sees which account this is, and a password
                 manager saves the new password under the right username. -->
            <div>
                <label for="reset-password-email">Email</label>
                <input id="reset-password-email" :value="email" type="email" autocomplete="username" readonly />
            </div>
            <div>
                <label for="reset-password-password">New password</label>
                <input
                    id="reset-password-password"
                    v-model="form.password"
                    type="password"
                    autocomplete="new-password"
                    :aria-invalid="passwordError !== null"
                    :aria-describedby="passwordError?.id"
                />
                <p v-if="passwordError" :id="passwordError.id">{{ passwordError.message }}</p>
            </div>
            <div>
                <label for="reset-password-password-confirmation">Confirm new password</label>
                <input
                    id="reset-password-password-confirmation"
                    v-model="form.password_confirmation"
                    type="password"
                    autocomplete="new-password"
                    :aria-invalid="passwordError !== null"
                    :aria-describedby="passwordError?.id"
                />
            </div>
            <button type="submit" :disabled="isPending">Change password</button>
            <!-- Inside the form, so it shows only while the form does: every
                 other state already has its own link out. -->
            <p><RouterLink :to="{ name: 'login' }">Back to log in</RouterLink></p>
        </form>
    </div>
</template>
