<script setup lang="ts">
// Project imports
import { useAuthStore } from '@/domains/auth/store';
import { useForm } from '@/form/useForm';

const store = useAuthStore();

// No fields, so no field errors: useForm is here for its double-click guard,
// isPending, and its re-throw of failures.
const { submit, isPending } = useForm('logout');

const onLogout = () => submit(() => store.logout());
</script>

<template>
    <div>
        <h1>Dashboard</h1>
        <button type="button" :disabled="isPending" @click="onLogout">Log out</button>
    </div>
</template>
