import axios, { isAxiosError } from 'axios';

const http = axios.create({
    baseURL: '/api',
    headers: { Accept: 'application/json' },
});

// The callback the interceptor below calls when a request comes back 401
// (unauthenticated). Private: only setUnauthenticatedHandler() writes it.
// This file only knows *when* to call it; main.ts supplies *what* it does
// (clear the store, go to /login), so http never imports the store or router.
let unauthenticatedHandler: (() => void) | null = null;

// A setter, not a subscription: one slot, so a second call replaces the first
// handler instead of adding another.
export const setUnauthenticatedHandler = (handler: () => void): void =>
{
    unauthenticatedHandler = handler;
};

// undefined for onFulfilled: a 2xx response passes through untouched.
http.interceptors.response.use(undefined, (error: unknown) =>
{
    if (isAxiosError(error) && error.response?.status === 401)
    {
        unauthenticatedHandler?.();
    }

    // Re-thrown every time, a 401 included: the caller must still stop at its
    // await. Swallowing it is up to the caller (useForm does, for forms).
    throw error;
});

export const getRequest = <ResponseData>(endpoint: string) => http.get<ResponseData>(endpoint);

export const postRequest = <RequestData, ResponseData>(endpoint: string, data: RequestData) => http.post<ResponseData>(endpoint, data);

export const putRequest = <RequestData, ResponseData>(endpoint: string, data: RequestData) => http.put<ResponseData>(endpoint, data);

export const deleteRequest = <ResponseData>(endpoint: string) => http.delete<ResponseData>(endpoint);
