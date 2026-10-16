import { getRequest, postRequest, deleteRequest } from '@/services/http';

// A user as the backend sends it (UserResourceData).
export interface User
{
    id: number;
    name: string;
    email: string;
}

// What the login form sends. Keys match LoginRequest's rules, so they are
// also the keys of a 422's errors.
export interface LoginCredentials
{
    email: string;
    password: string;
}

// What the register form sends. Keys match RegisterRequest's rules.
// password_confirmation is the field Laravel's 'confirmed' rule reads.
export interface Registration
{
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
}

// Logs in and returns the user. A 422 (bad credentials, unverified email) is
// thrown, not caught, so useForm's submit() can show it next to the field.
export const login = async (credentials: LoginCredentials): Promise<User> =>
{
    const response = await postRequest<LoginCredentials, User>('/auth/login', credentials);

    return response.data;
};

// Creates the account and mails a verification link; if the email is taken it
// mails the owner instead. Both answer 204 (no content), so the page can't tell
// them apart (no account enumeration) and there is nothing to return.
export const register = async (registration: Registration): Promise<void> =>
{
    await postRequest<Registration, void>('/auth/register', registration);
};

// The logged-in user. Throws a 401 (unauthenticated) when there is no session.
export const fetchUser = async (): Promise<User> =>
{
    const response = await getRequest<User>('/auth/user');

    return response.data;
};

// Ends the session: 204 (no content).
export const logout = async (): Promise<void> =>
{
    await deleteRequest<void>('/auth/logout');
};
