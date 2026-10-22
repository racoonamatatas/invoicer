import { getRequest, postRequest, putRequest, deleteRequest } from '@/services/http';

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

// What the verify-email page sends. The key matches VerifyEmailRequest's
// rules, and an invalid or expired token comes back as a 422 under it.
export interface EmailVerification
{
    token: string;
}

// What the resend-verification form sends. The key matches
// ResendVerificationRequest's rules, so it is also the key of a 422's errors.
export interface VerificationResend
{
    email: string;
}

// What the forgot-password form sends. The key matches
// ForgotPasswordRequest's rules, so it is also the key of a 422's errors.
export interface PasswordForgot
{
    email: string;
}

// What the reset-password page sends. Keys match ResetPasswordRequest's rules.
// password_confirmation is the field Laravel's 'confirmed' rule reads, and an
// invalid or expired token comes back as a 422 under token.
export interface PasswordReset
{
    token: string;
    email: string;
    password: string;
    password_confirmation: string;
}

// What the change-password page sends. Keys match ChangePasswordRequest's
// rules. A wrong current password comes back as a 422 under current_password,
// and a mismatched confirmation under password (Laravel's 'confirmed' rule).
export interface PasswordChange
{
    current_password: string;
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

// Verifies the email the token was mailed to: 204 (no content). The token
// works once, so a second post gets the 422, thrown for useForm to show.
export const verifyEmail = async (token: string): Promise<void> =>
{
    await postRequest<EmailVerification, void>('/auth/verify-email', { token });
};

// Mails a new verification link, but only when the email belongs to an
// unverified account. Always 204 (no content), so the page can't tell which
// (no account enumeration) and there is nothing to return.
export const resendVerification = async (email: string): Promise<void> =>
{
    await postRequest<VerificationResend, void>('/auth/resend-verification', { email });
};

// Mails a password reset link, but only when the email belongs to an account.
// Always 204 (no content), so the page can't tell which (no account
// enumeration) and there is nothing to return.
export const forgotPassword = async (email: string): Promise<void> =>
{
    await postRequest<PasswordForgot, void>('/auth/forgot-password', { email });
};

// Sets the new password: 204 (no content). A 422 (invalid token, weak or
// unconfirmed password) is thrown, not caught, so useForm's submit() can show it.
export const resetPassword = async (reset: PasswordReset): Promise<void> =>
{
    await postRequest<PasswordReset, void>('/auth/reset-password', reset);
};

// Sets a new password for the logged-in user: 204 (no content). Every other
// session is logged out and this one stays. A 422 (wrong current password,
// weak or unconfirmed new one) is thrown, not caught, so useForm's submit()
// can show it.
export const changePassword = async (change: PasswordChange): Promise<void> =>
{
    await putRequest<PasswordChange, void>('/auth/password', change);
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
