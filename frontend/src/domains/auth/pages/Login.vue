<script setup lang="ts">
// Package imports
import { ref } from 'vue';

// Project imports
import type { LoginCredentials } from '@/services/auth';
import { useAuthStore } from '@/domains/auth/store';
import { useForm } from '@/form/useForm';

const form = ref<LoginCredentials>({ email: '', password: '' });
const store = useAuthStore();
const { submit, isPending } = useForm<keyof LoginCredentials>('login');

const onSubmit = () => submit(() => store.login(form.value));

</script>

<template>
    <div>
        <h1>Log in</h1>
        <form aria-label="Log in" @submit.prevent="onSubmit">
            <div>
                <label for="login-email">Email</label>
                <input id="login-email" v-model="form.email" type="email" autocomplete="username" />
            </div>
            <div>
                <label for="login-password">Password</label>
                <input id="login-password" v-model="form.password" type="password" autocomplete="current-password" />
            </div>
            <button type="submit" :disabled="isPending">Log in</button>
        </form>
    </div>
</template>
