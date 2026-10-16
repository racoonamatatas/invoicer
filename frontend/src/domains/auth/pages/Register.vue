<script setup lang="ts">
// Package imports
import { ref } from 'vue';

// Project imports
import type { Registration } from '@/services/auth';

const form = ref<Registration>({ name: '', email: '', password: '', password_confirmation: '' });

</script>


<template>
    <div>
        <h1>Create an account</h1>
        <form aria-label="Create an account" @submit.prevent>
            <div>
                <label for="register-name">Name</label>
                <input
                    id="register-name"
                    v-model="form.name"
                    type="text"
                    autocomplete="name"
                />

            </div>
            <div>
                <label for="register-email">Email</label>
                <input
                    id="register-email"
                    v-model="form.email"
                    type="email"
                    autocomplete="email"

                />

            </div>
            <div>
                <label for="register-password">Password</label>
                <input
                    id="register-password"
                    v-model="form.password"
                    type="password"
                    autocomplete="new-password"
                />
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
            <button type="submit">Create account</button>
        </form>
    </div>
</template>
