import { createMemoryHistory, createRouter } from 'vue-router';

import { appRoutes } from '@/router/routes';

// A router with every route of the app, so any link a page renders resolves.
// The memory history is a fake: a working in-memory stand-in for the
// browser's address bar. No guard is registered, so a page test only sees
// what the page itself does.
export const createTestRouter = () => createRouter({
    history: createMemoryHistory(),
    routes: appRoutes.map((route) => route.toRecord()),
});
