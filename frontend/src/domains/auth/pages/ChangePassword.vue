<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';

// Project imports
import { changePassword, type PasswordChange } from '@/services/auth';
import { useAuthStore } from '@/domains/auth/store';
import { useForm } from '@/composables/useForm';

const store = useAuthStore();

const emptyForm = (): PasswordChange => ({ current_password: '', password: '', password_confirmation: '' });
const form = ref<PasswordChange>(emptyForm());
// password_confirmation: false, because Laravel's confirmed rule reports a
// mismatch under password. Same trade-off as ResetPassword.vue: an error under
// password_confirmation next to one on a displayed field would show nowhere.
const { submit, isPending, fieldError, throttleMessage, generalMessage } = useForm<keyof PasswordChange>('change-password', { current_password: true, password: true, password_confirmation: false });
const isChanged = ref(false);

const currentPasswordError = computed(() => fieldError('current_password'));
// One error slot for both new-password fields, see the useForm call.
const passwordError = computed(() => fieldError('password'));

// The flag is set inside the callback: submit() resolves the same way after
// a 422, so only reaching that line proves the password was changed.
// The fields are emptied so the passwords don't stay in memory behind the
// hidden form. Unlike a reset, this session survives (the backend keeps it),
// so the store is left alone and the user stays logged in.
const onSubmit = () => submit(async () =>
{
    await changePassword(form.value);
    isChanged.value = true;
    form.value = emptyForm();
});
</script>

<template>
    <div>
        <h1>Change password</h1>

        <!-- Always rendered, so a screen reader announces whichever outcome
             appears after submitting. -->
        <div role="status">
            <p v-if="isChanged">
                Your password is changed. You are logged out on every other device.
                <RouterLink :to="{ name: 'home' }">Continue</RouterLink>
            </p>
            <p v-else-if="throttleMessage">{{ throttleMessage }}</p>
            <p v-else-if="generalMessage">{{ generalMessage }}</p>
        </div>

        <!-- Hidden after success: a second change would need the new password
             as the current one, which a refilled form would only confuse. -->
        <form v-if="!isChanged" aria-label="Change password" @submit.prevent="onSubmit">
            <!-- Read-only, so a password manager saves the new password under
                 the right username. The route is protected, so the user is
                 there; the fallback only satisfies the nullable type. -->
            <div>
                <label for="change-password-email">Email</label>
                <input id="change-password-email" :value="store.user?.email ?? ''" type="email" autocomplete="username" readonly />
            </div>
            <div>
                <label for="change-password-current-password">Current password</label>
                <input
                    id="change-password-current-password"
                    v-model="form.current_password"
                    type="password"
                    autocomplete="current-password"
                    :aria-invalid="currentPasswordError !== null"
                    :aria-describedby="currentPasswordError?.id"
                />
                <p v-if="currentPasswordError" :id="currentPasswordError.id">{{ currentPasswordError.message }}</p>
            </div>
            <div>
                <label for="change-password-password">New password</label>
                <input
                    id="change-password-password"
                    v-model="form.password"
                    type="password"
                    autocomplete="new-password"
                    :aria-invalid="passwordError !== null"
                    :aria-describedby="passwordError?.id"
                />
                <p v-if="passwordError" :id="passwordError.id">{{ passwordError.message }}</p>
            </div>
            <div>
                <label for="change-password-password-confirmation">Confirm new password</label>
                <input
                    id="change-password-password-confirmation"
                    v-model="form.password_confirmation"
                    type="password"
                    autocomplete="new-password"
                    :aria-invalid="passwordError !== null"
                    :aria-describedby="passwordError?.id"
                />
            </div>
            <button type="submit" :disabled="isPending">Change password</button>
            <p><RouterLink :to="{ name: 'home' }">Cancel</RouterLink></p>
        </form>
    </div>
</template>
