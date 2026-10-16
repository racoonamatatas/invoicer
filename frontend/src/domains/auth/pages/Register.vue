<script setup lang="ts">
// Package imports
import { computed, ref } from 'vue';

// Project imports
import { register, type Registration } from '@/services/auth';
import { useForm } from '@/form/useForm';

const form = ref<Registration>({ name: '', email: '', password: '', password_confirmation: '' });
const { submit, isPending, fieldError } = useForm<keyof Registration>('register');

// One value per field, so the error text and both aria attributes read
// from the same source. No password_confirmation: Laravel's 'confirmed'
// rule reports a mismatch under password.
const nameError = computed(() => fieldError('name'));
const emailError = computed(() => fieldError('email'));
const passwordError = computed(() => fieldError('password'));

const onSubmit = () => submit(() => register(form.value));

</script>


<template>
    <div>
        <h1>Create an account</h1>
        <form aria-label="Create an account" @submit.prevent="onSubmit">
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
