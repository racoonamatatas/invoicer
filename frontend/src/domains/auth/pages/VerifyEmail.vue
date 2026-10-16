<script setup lang="ts">
// Package imports
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '');
</script>

<template>
    <div>
        <h1>Verify your email</h1>

        <button v-if="token" type="button">Verify my email</button>
        <p v-else>This link is incomplete. Open the link from your email again.</p>
    </div>
</template>
