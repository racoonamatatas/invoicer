import axios from 'axios';

const http = axios.create({
    baseURL: '/api',
    headers: { Accept: 'application/json' },
});

export const getRequest = <ResponseData>(endpoint: string) => http.get<ResponseData>(endpoint);

export const postRequest = <RequestData, ResponseData>(endpoint: string, data: RequestData) => http.post<ResponseData>(endpoint, data);

export const putRequest = <RequestData, ResponseData>(endpoint: string, data: RequestData) => http.put<ResponseData>(endpoint, data);

export const deleteRequest = <ResponseData>(endpoint: string) => http.delete<ResponseData>(endpoint);
