import axios from 'axios';

const http = axios.create({
    baseURL: '/api',
    headers: { Accept: 'application/json' },
});
