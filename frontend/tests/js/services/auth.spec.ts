import type { AxiosResponse } from 'axios';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import { fetchUser, login, logout, register, resendVerification, verifyEmail } from '@/services/auth';
import { deleteRequest, getRequest, postRequest } from '@/services/http';

// Every export of the http module becomes a vi.fn(), so no request leaves the test.
vi.mock('@/services/http');

const user = { id: 1, name: 'Jan de Vries', email: 'jan@example.nl' };

describe('auth service', () =>
{
    // Each test programs its own responses; none leak into the next.
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should post the credentials to /auth/login and return the user from the 200 (ok) response', async () =>
    {
        // Arrange: only data matters to login, so the rest of the axios response is left out
        const credentials = { email: 'jan@example.nl', password: 'secret-password' };
        vi.mocked(postRequest).mockResolvedValue({ data: user } as AxiosResponse);

        // Act
        const result = await login(credentials);

        // Assert: one request to the right route, and the user itself comes back, not the response
        expect(postRequest).toHaveBeenCalledExactlyOnceWith('/auth/login', credentials);
        expect(result).toBe(user);
    });

    it('should post the registration to /auth/register and return nothing from the 204 (no content) response', async () =>
    {
        // Arrange: axios gives an empty string as the data of a 204
        const registration = { name: 'Jan de Vries', email: 'jan@example.nl', password: 'secret-password', password_confirmation: 'secret-password' };
        vi.mocked(postRequest).mockResolvedValue({ data: '' } as AxiosResponse);

        // Act
        const result = await register(registration);

        // Assert: one request to the right route, and nothing leaks out to the page
        expect(postRequest).toHaveBeenCalledExactlyOnceWith('/auth/register', registration);
        expect(result).toBeUndefined();
    });

    it('should post the token to /auth/verify-email and return nothing from the 204 (no content) response', async () =>
    {
        // Arrange: postRequest is a stub (empty 204 data) and a spy (records its call)
        vi.mocked(postRequest).mockResolvedValue({ data: '' } as AxiosResponse);

        // Act
        const result = await verifyEmail('a1b2c3-token-from-the-mail');

        // Assert (interaction): one request to the right route, with the token under the key the backend reads
        expect(postRequest).toHaveBeenCalledExactlyOnceWith('/auth/verify-email', { token: 'a1b2c3-token-from-the-mail' });

        // Assert (outcome): nothing leaks out to the page
        expect(result).toBeUndefined();
    });

    it('should post the email to /auth/resend-verification and return nothing from the 204 (no content) response', async () =>
    {
        // Arrange: postRequest is a stub (empty 204 data) and a spy (records its call)
        vi.mocked(postRequest).mockResolvedValue({ data: '' } as AxiosResponse);

        // Act
        const result = await resendVerification('jan@example.nl');

        // Assert (interaction): one request to the right route, with the email under the key the backend reads
        expect(postRequest).toHaveBeenCalledExactlyOnceWith('/auth/resend-verification', { email: 'jan@example.nl' });

        // Assert (outcome): nothing leaks out to the page
        expect(result).toBeUndefined();
    });

    it('should get /auth/user and return the user from the 200 (ok) response', async () =>
    {
        // Arrange
        vi.mocked(getRequest).mockResolvedValue({ data: user } as AxiosResponse);

        // Act
        const result = await fetchUser();

        // Assert: one request to the right route, and the user itself comes back, not the response
        expect(getRequest).toHaveBeenCalledExactlyOnceWith('/auth/user');
        expect(result).toBe(user);
    });

    it('should delete /auth/logout and return nothing from the 204 (no content) response', async () =>
    {
        // Arrange: axios gives an empty string as the data of a 204
        vi.mocked(deleteRequest).mockResolvedValue({ data: '' } as AxiosResponse);

        // Act
        const result = await logout();

        // Assert: one request to the right route, and nothing leaks out to the page
        expect(deleteRequest).toHaveBeenCalledExactlyOnceWith('/auth/logout');
        expect(result).toBeUndefined();
    });
});
