import axios from 'axios';
import { destroyErrors, destroyMessage, setErrorBag, setMessage } from '../error';

const http = axios.create({
    baseURL: '/api',
    headers: { Accept: 'application/json' },
});

http.interceptors.request.use(
    config =>
    {
        destroyErrors(); // Clear old errors before executing a new request.
        destroyMessage(); // Clear old messages before executing a new request.
        return config;
    },
    error => Promise.reject(error)
);

http.interceptors.response.use(
    response => response,
    error =>
    {
        if (error.response && error.response?.status === 422)
        {
            setErrorBag(error.response.data.errors); // Save validation errors in the error bag.
            setMessage(error.response.data.message); // Save the general error message.
        }

        return Promise.reject(error);
    }
);

export const getRequest = <ResponseData>(endpoint: string) => http.get<ResponseData>(endpoint);

export const postRequest = <RequestData, ResponseData>(endpoint: string, data: RequestData) => http.post<ResponseData>(endpoint, data);

export const putRequest = <RequestData, ResponseData>(endpoint: string, data: RequestData) => http.put<ResponseData>(endpoint, data);

export const deleteRequest = <ResponseData>(endpoint: string) => http.delete<ResponseData>(endpoint);
