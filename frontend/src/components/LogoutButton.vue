<script setup lang="ts">
// Package imports
import { ref } from 'vue';

// Project imports
import { useAuthStore } from '@/domains/auth/store';
import { useForm } from '@/composables/useForm';

const auth = useAuthStore();

// No fields, so no field errors: useForm is here for its double-click guard,
// isPending, and its re-throw of failures.
const { submit, isPending } = useForm('logout', {});

// The reload sits inside the callback, so a failed logout keeps the user
// here, still logged in. A full page load, not router.push: every store and
// in-flight request dies with the document, so nothing reaches the next
// session. Back can't revive it from the back/forward cache either:
// reloadRestoredPage reloads any restored page.
//
// hasLoggedOut keeps the button disabled after that: location.assign only
// starts the page load, so isPending is false again before the page goes,
// and a second click would send a logout for a session that has ended.
const hasLoggedOut = ref(false);

const onLogout = () => submit(async () =>
{
    await auth.logout();
    hasLoggedOut.value = true;
    window.location.assign('/login');
});
</script>

<template>
    <button type="button" :disabled="isPending || hasLoggedOut" @click="onLogout">Log out</button>
</template>
