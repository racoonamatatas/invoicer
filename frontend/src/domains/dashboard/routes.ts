import type { RouteRecordRaw } from 'vue-router';


export const dashboardRoutes: RouteRecordRaw[] = [
    { path: '/', component: () => import('./pages/Dashboard.vue'), name: 'dashboard' },
];
