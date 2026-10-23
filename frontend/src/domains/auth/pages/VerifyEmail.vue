<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

// Project imports
import { verifyEmail, type EmailVerification } from '@/services/auth';
import { useForm } from '@/composables/useForm';

const route = useRoute();
const router = useRouter();

// Read once, not as a computed: after success the URL is cleared on purpose,
// and the page must not then read as an incomplete link.
// Safe only because the page is entered by a full page load (the mailed
// link). Vue Router reuses this instance for a same-route navigation, so an
// in-app link to verifyEmail with a different query would keep posting the
// old token: such a link would need this as a computed.
const token = typeof route.query.token === 'string' ? route.query.token : '';

// Only the fields the user types; the token comes from the link.
const form = ref<Pick<EmailVerification, 'name' | 'password' | 'password_confirmation'>>({ name: '', password: '', password_confirmation: '' });
// password_confirmation: false, because Laravel's confirmed rule reports a
// mismatch under password. Trade-off: if a 422 ever carried an error under
// password_confirmation next to an error on a displayed field, that error
// would show nowhere, since generalMessage only covers a 422 with no
// displayed error at all. Today the backend never sends one.
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof EmailVerification>('verify-email', { token: true, name: true, password: true, password_confirmation: false });
const isPasswordSet = ref(false);

const nameError = computed(() => fieldError('name'));
// Laravel's 'confirmed' rule reports a mismatch under password, not under
// password_confirmation, so one error slot covers both fields.
const passwordError = computed(() => fieldError('password'));
// The token isn't an input, so its error can't sit next to one. It means the
// link itself is dead, and the fix is a new one: registering again sends it.
const tokenError = computed(() => fieldError('token'));

// Posted on submit, never on load: the token works once, so a refresh or a
// mail scanner would otherwise spend it. The flag is set inside the callback:
// submit() resolves the same way after a 422, so only reaching that line
// proves the account was created.
// After success the spent token is removed from the URL, so a refresh or a
// copied link can't post it again and get "invalid link" for a finished
// signup. Set the flag first: the account exists even if the URL change fails.
// No login: the user types the password they just chose, which also proves
// their password manager saved it.
const onSubmit = () => submit(async () =>
{
    await verifyEmail({ token, ...form.value });
    isPasswordSet.value = true;
    // Caught, not left to submit(): it would hand a rejection to the app's
    // error handler, and an error page after a signup that worked would read
    // as a failed signup. Losing the cleanup only leaves a spent token in the URL.
    await router.replace({ name: 'verifyEmail' }).catch(() => undefined);
});
</script>

<template>
    <div>
        <h1>Finish signing up</h1>

        <!-- Always rendered, so a screen reader announces whichever outcome
             appears after submitting. -->
        <div role="status">
            <p v-if="isPasswordSet">Your password is set. <RouterLink :to="{ name: 'login' }">Log in</RouterLink></p>
            <!-- Two exits: the same 422 comes back for an expired link and for
                 one that was already used, and only the user knows which. -->
            <p v-else-if="tokenError" :id="tokenError.id">
                {{ tokenError.message }}
                <RouterLink :to="{ name: 'register' }">Get a new link</RouterLink>
                or, if you already finished, <RouterLink :to="{ name: 'login' }">log in</RouterLink>.
            </p>
            <!-- The token wasn't checked, so it may still be good: the form
                 stays for a retry once the wait is over. -->
            <p v-else-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
        </div>

        <p v-if="!token">
            This link is incomplete. Open the link from your email again, or
            <RouterLink :to="{ name: 'register' }">get a new link</RouterLink>.
        </p>
        <!-- Hidden after success, and after a bad link: a used or expired token
             can't start working.
             required/minlength/maxlength repeat PasswordRules::forNewPassword()
             (15 to 72 characters), so an empty field or a short password is
             caught by the browser instead of spending one of the few verify
             requests a minute the endpoint allows. The backend stays the judge:
             a mismatch or a leaked password still comes back as a 422. -->
        <form v-else-if="!isPasswordSet && !tokenError" aria-label="Finish signing up" @submit.prevent="onSubmit">
            <div>
                <label for="verify-email-name">Name</label>
                <input
                    id="verify-email-name"
                    v-model="form.name"
                    type="text"
                    autocomplete="name"
                    required
                    :aria-invalid="nameError !== null"
                    :aria-describedby="nameError?.id"
                />
                <p v-if="nameError" :id="nameError.id">{{ nameError.message }}</p>
            </div>
            <div>
                <label for="verify-email-password">Password</label>
                <input
                    id="verify-email-password"
                    v-model="form.password"
                    type="password"
                    autocomplete="new-password"
                    required
                    minlength="15"
                    maxlength="72"
                    :aria-invalid="passwordError !== null"
                    :aria-describedby="passwordError?.id"
                />
                <p v-if="passwordError" :id="passwordError.id">{{ passwordError.message }}</p>
            </div>
            <div>
                <label for="verify-email-password-confirmation">Confirm password</label>
                <input
                    id="verify-email-password-confirmation"
                    v-model="form.password_confirmation"
                    type="password"
                    autocomplete="new-password"
                    required
                    :aria-invalid="passwordError !== null"
                    :aria-describedby="passwordError?.id"
                />
            </div>
            <button type="submit" :disabled="isPending">Set password</button>
        </form>
    </div>
</template>
