<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';

// Project imports
import type { LoginCredentials } from '@/services/auth';
import { useAuthStore } from '@/domains/auth/store';
import { useForm } from '@/form/useForm';

const form = ref<LoginCredentials>({ email: '', password: '' });
const store = useAuthStore();
const { submit, isPending, fieldError } = useForm<keyof LoginCredentials>('login');

// One value per field, so the error text and both aria attributes read
// from the same source.
const emailError = computed(() => fieldError('email'));
const passwordError = computed(() => fieldError('password'));

const onSubmit = () => submit(() => store.login(form.value));

</script>

<template>
    <div>
        <h1>Log in</h1>
        <form aria-label="Log in" @submit.prevent="onSubmit">
            <div>
                <label for="login-email">Email</label>
                <input
                    id="login-email"
                    v-model="form.email"
                    type="email"
                    autocomplete="username"
                    :aria-invalid="emailError !== null"
                    :aria-describedby="emailError?.id"
                />
                <p v-if="emailError" :id="emailError.id">{{ emailError.message }}</p>
            </div>
            <div>
                <label for="login-password">Password</label>
                <input
                    id="login-password"
                    v-model="form.password"
                    type="password"
                    autocomplete="current-password"
                    :aria-invalid="passwordError !== null"
                    :aria-describedby="passwordError?.id"
                />
                <p v-if="passwordError" :id="passwordError.id">{{ passwordError.message }}</p>
            </div>
            <button type="submit" :disabled="isPending">Log in</button>
        </form>
    </div>
</template>
