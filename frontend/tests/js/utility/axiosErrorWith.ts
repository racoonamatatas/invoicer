import { AxiosError, AxiosHeaders } from 'axios';

// Builds the AxiosError a failed request throws. AxiosResponse requires every field
// (statusText, headers, config with AxiosHeaders) under strict types, so each test
// only states the status and body it cares about.
export const axiosErrorWith = (status: number, data: unknown) =>
{
    const config = { headers: new AxiosHeaders() };

    return new AxiosError('Request failed', AxiosError.ERR_BAD_REQUEST, config, undefined, {
        data,
        status,
        statusText: '',
        headers: {},
        config,
    });
};
