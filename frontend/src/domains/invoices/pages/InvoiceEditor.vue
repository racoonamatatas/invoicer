<script setup lang="ts">
// A placeholder, so the invoices list's links already resolve. It is replaced
// when the editor is built, which is known and planned.

// Package imports
import { RouterLink } from 'vue-router';
</script>

<template>
    <div>
        <h1>Draft invoice</h1>
        <p>The editor isn't built yet.</p>
        <!-- No params: Vue Router reuses the current :businessId. -->
        <p><RouterLink :to="{ name: 'invoices' }">Back to the invoices</RouterLink></p>
    </div>
</template>
