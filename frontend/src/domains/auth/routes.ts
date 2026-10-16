import type { RouteRecordRaw } from 'vue-router';


export const authRoutes: RouteRecordRaw[] = [
    { path: '/login', component: () => import('./pages/Login.vue'), name: 'login' },
];
