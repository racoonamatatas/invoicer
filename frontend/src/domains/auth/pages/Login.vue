<script setup lang="ts">
// Package imports
import { ref } from 'vue';

// Project imports
import type { LoginCredentials } from '@/services/auth';

const form = ref<LoginCredentials>({ email: '', password: '' });

</script>

<template>
    <div>
        <h1>Log in</h1>
        <form aria-label="Log in" @submit.prevent>
            <div>
                <label for="login-email">Email</label>
                <input id="login-email" v-model="form.email" type="email" autocomplete="username" />
            </div>
            <div>
                <label for="login-password">Password</label>
                <input id="login-password" v-model="form.password" type="password" autocomplete="current-password" />
            </div>
            <button type="submit">Log in</button>
        </form>
    </div>
</template>
