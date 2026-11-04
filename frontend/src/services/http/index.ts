import axios, { isAxiosError, type AxiosError, type AxiosResponse } from 'axios';

const http = axios.create({
    baseURL: '/api',
    headers: { Accept: 'application/json' },
});

// The callback the interceptor below calls when a request comes back 401
// (unauthenticated). Private: only setUnauthenticatedHandler() writes it.
// This file only knows *when* to call it; main.ts supplies *what* it does
// (clear the store, go to /login), so http never imports the store or router.
// It returns whether it ended a session: only then is the 401 handled.
let unauthenticatedHandler: (() => boolean) | null = null;

// A setter, not a subscription: one slot, so a second call replaces the first
// handler instead of adding another.
export const setUnauthenticatedHandler = (handler: () => boolean): void =>
{
    unauthenticatedHandler = handler;
};

// What a request rejects with when its 401 ended the session: the
// unauthenticated handler logged the user out and /login is loading. A class,
// so a caller can tell it apart from a plain 401 with instanceof: this one has
// been handled, a plain 401 hasn't. The original 401 is kept as `cause`.
export class SessionEndedError extends Error
{
    constructor(cause: unknown)
    {
        super('The session ended', { cause });
        this.name = 'SessionEndedError';
    }
}

// What a service throws when a 2xx response's body isn't the shape it
// promised, e.g. after a backend change the frontend hasn't caught up with.
// Thrown instead of returning the body as-is, so a missing key fails here,
// loudly, and not later as an `undefined` deep inside a page. The body is
// left out entirely, not only out of the message: it may hold customer data
// (a business's KvK number, address), and the console prints an error's
// `cause` too. The network tab has it. This only keeps this error clean: an
// axios error, SessionEndedError's cause included, still carries its request
// and response, so an error reporter wired up later must scrub those itself.
export class UnexpectedResponseError extends Error
{
    constructor(endpoint: string)
    {
        super(`Unexpected response from ${endpoint}`);
        this.name = 'UnexpectedResponseError';
    }
}

// Returns the body once the guard has proven its shape, or throws an
// UnexpectedResponseError. The one way a service turns network data, which
// is `unknown`, into a type.
export const checkResponse = <Body>(endpoint: string, body: unknown, isExpected: (value: unknown) => value is Body): Body =>
{
    if (!isExpected(body))
    {
        throw new UnexpectedResponseError(endpoint);
    }

    return body;
};

// Exactly what the backend sends as a version's ETag: a strong ETag, the
// digits in quotes, without a leading zero. Anchored at both ends, so a weak
// W/"3" or a "*" doesn't match, and neither does "03": an ETag is compared
// byte for byte, so that would be a different version from the "3" that was
// sent.
const VERSION_ETAG = /^"(0|[1-9][0-9]*)"$/;

// The version a response's ETag names, for a later PUT or DELETE to send back
// as If-Match. Throws an UnexpectedResponseError when the header is missing or
// isn't exactly one version, like checkResponse() does for a body.
export const versionFrom = (endpoint: string, response: AxiosResponse): number =>
{
    // unknown: it came over the network. axios lowercases header names.
    const etag: unknown = response.headers['etag'];
    const match = typeof etag === 'string' ? VERSION_ETAG.exec(etag) : null;
    const digits = match?.[1];

    if (digits === undefined)
    {
        throw new UnexpectedResponseError(endpoint);
    }

    // The regex allows any number of digits. Past 2^53 a number can't hold
    // every integer, so the version sent back would not be the one we got.
    const version = Number(digits);
    if (!Number.isSafeInteger(version))
    {
        throw new UnexpectedResponseError(endpoint);
    }

    return version;
};

// True when a request failed with a 401 (unauthenticated): there is no
// session. The raw axios check, written once for the interceptor and the auth
// store's restore(). A SessionEndedError answers false: it is not an axios
// error, and forms recognise it with instanceof instead.
// `error is AxiosError`: after a true answer, callers can read error.response.
export const isUnauthenticated = (error: unknown): error is AxiosError =>
{
    return isAxiosError(error) && error.response?.status === 401;
};

// Whether a write that failed may still have been stored, so retrying it
// could store it twice. Only an answer in the 4xx range is a refusal: a 422
// or a 429 stores nothing, and neither does a 401 that ended the session.
// No answer at all (a timeout, a dropped connection), a 5xx (a proxy's 502 or
// 504 can come after the backend committed) or an answer that couldn't be read
// (UnexpectedResponseError) may all hide a stored write.
export const mayHaveBeenStored = (error: unknown): boolean =>
{
    if (error instanceof SessionEndedError)
    {
        return false;
    }

    if (isAxiosError(error) && error.response !== undefined)
    {
        return error.response.status >= 500;
    }

    return true;
};

// undefined for onFulfilled: a 2xx response passes through untouched.
http.interceptors.response.use(undefined, (error: unknown) =>
{
    // `?? false`: with no handler set, nothing ended the session.
    if (isUnauthenticated(error) && (unauthenticatedHandler?.() ?? false))
    {
        // Handled: replaced, so the caller can tell it apart from a 401
        // nobody explained (see SessionEndedError).
        throw new SessionEndedError(error);
    }

    // Rejected either way, so the caller still stops at its await. A 401
    // the handler didn't end a session for (e.g. restore()'s at boot) passes
    // on unchanged. Swallowing is up to the caller (useForm does, for forms).
    throw error;
});

export const getRequest = <ResponseData>(endpoint: string) => http.get<ResponseData>(endpoint);

export const postRequest = <RequestData, ResponseData>(endpoint: string, data: RequestData) => http.post<ResponseData>(endpoint, data);

// The headers that send `version` as If-Match, or none without one. A strong
// ETag, quoted: the same format versionFrom() reads, written in this one file
// so no service has to know it. Undefined leaves If-Match out entirely, for a
// resource that isn't versioned.
const ifMatchHeaders = (version: number | undefined): Record<string, string> =>
{
    if (version === undefined)
    {
        return {};
    }

    // The same rule versionFrom() reads with. A version always came from an
    // ETag, so anything else (NaN, -1, 1.5) is a bug in the caller: thrown
    // here, before a request goes out with If-Match: "NaN".
    if (!Number.isSafeInteger(version) || version < 0)
    {
        throw new RangeError(`Not a version: ${version}`);
    }

    return { 'If-Match': `"${version}"` };
};

export const putRequest = <RequestData, ResponseData>(endpoint: string, data: RequestData, version?: number) =>
    http.put<ResponseData>(endpoint, data, { headers: ifMatchHeaders(version) });

export const deleteRequest = <ResponseData>(endpoint: string, version?: number) =>
    http.delete<ResponseData>(endpoint, { headers: ifMatchHeaders(version) });
