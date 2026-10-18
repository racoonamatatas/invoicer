<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';

// Project imports
import { register, type Registration } from '@/services/auth';
import { useForm } from '@/composables/useForm';

const form = ref<Registration>({ name: '', email: '', password: '', password_confirmation: '' });
const { submit, isPending, fieldError, throttleMessage } = useForm<keyof Registration>('register');

// One value per field, so the error text and both aria attributes read
// from the same source. No password_confirmation: Laravel's 'confirmed'
// rule reports a mismatch under password.
const nameError = computed(() => fieldError('name'));
const emailError = computed(() => fieldError('email'));
const passwordError = computed(() => fieldError('password'));

const isRegistered = ref(false);

// The flag is set inside the callback: submit() resolves the same way after
// a 422, so only reaching that line proves the register succeeded.
const onSubmit = () => submit(async () =>
{
    await register(form.value);
    isRegistered.value = true;
});

</script>


<template>
    <div>
        <h1>Create an account</h1>
        <!-- Always rendered: a screen reader only announces changes inside a
             live region it already knows about. The same text for a new and an
             existing email, so the page reveals nothing about which accounts exist. -->
        <div role="status">
            <p v-if="isRegistered">Check your inbox at {{ form.email }}. We've sent you an email with the next step.</p>
            <p v-else-if="throttleMessage">{{ throttleMessage }}</p>
        </div>
        <form v-if="!isRegistered" aria-label="Create an account" @submit.prevent="onSubmit">
            <div>
                <label for="register-name">Name</label>
                <input
                    id="register-name"
                    v-model="form.name"
                    type="text"
                    autocomplete="name"
                    :aria-invalid="nameError !== null"
                    :aria-describedby="nameError?.id"
                />
                <p v-if="nameError" :id="nameError.id">{{ nameError.message }}</p>
            </div>
            <div>
                <label for="register-email">Email</label>
                <input
                    id="register-email"
                    v-model="form.email"
                    type="email"
                    autocomplete="email"
                    :aria-invalid="emailError !== null"
                    :aria-describedby="emailError?.id"
                />
                <p v-if="emailError" :id="emailError.id">{{ emailError.message }}</p>
            </div>
            <div>
                <label for="register-password">Password</label>
                <input
                    id="register-password"
                    v-model="form.password"
                    type="password"
                    autocomplete="new-password"
                    :aria-invalid="passwordError !== null"
                    :aria-describedby="passwordError?.id"
                />
                <p v-if="passwordError" :id="passwordError.id">{{ passwordError.message }}</p>
            </div>
            <div>
                <label for="register-password-confirmation">Password confirmation</label>
                <input
                    id="register-password-confirmation"
                    v-model="form.password_confirmation"
                    type="password"
                    autocomplete="new-password"
                />
            </div>
            <button type="submit" :disabled="isPending">Create account</button>
        </form>
    </div>
</template>
