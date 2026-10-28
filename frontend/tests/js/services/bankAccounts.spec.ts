import type { AxiosResponse } from 'axios';
import { beforeEach, describe, it, expect, vi } from 'vitest';

import {
    createBankAccount,
    deleteBankAccount,
    isBankAccount,
    listBankAccounts,
    updateBankAccountLabel,
    type BankAccountLabelPayload,
    type BankAccountPayload,
} from '@/services/bankAccounts';
import { deleteRequest, getRequest, postRequest, putRequest, UnexpectedResponseError } from '@/services/http';

// Only the request functions become vi.fn()s, so no request leaves the test.
// checkResponse and UnexpectedResponseError stay real: they are what these
// tests are about.
vi.mock('@/services/http', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/http')>(),
    getRequest: vi.fn<typeof getRequest>(),
    postRequest: vi.fn<typeof postRequest>(),
    putRequest: vi.fn<typeof putRequest>(),
    deleteRequest: vi.fn<typeof deleteRequest>(),
}));

// An account as BankAccountResourceData sends it.
const account = {
    id: 3,
    iban: 'NL91ABNA0417164300',
    label: 'Main',
};

const other = {
    id: 4,
    iban: 'NL02RABO0123456789',
    label: 'Savings',
};

// As typed: the backend normalises the IBAN, so the service sends it as is.
const payload: BankAccountPayload = {
    iban: 'nl91 abna 0417 1643 00',
    label: 'Main',
};

const labelPayload: BankAccountLabelPayload = { label: 'Business' };

// A copy of the account without one key.
const accountWithout = (key: keyof typeof account): Record<string, unknown> =>
{
    const copy: Record<string, unknown> = { ...account };
    delete copy[key];

    return copy;
};

describe('isBankAccount', () =>
{
    it.for([
        { name: 'every field filled', value: account },
        // A column added to BankAccountResourceData mustn't break the SPA before it uses it.
        { name: 'an extra key', value: { ...account, created_at: '2026-10-28' } },
    ])('should accept a bank account with $name', ({ value }) =>
    {
        // Act + Assert
        expect(isBankAccount(value)).toBe(true);
    });

    it.for(Object.keys(account).map((key) => ({ name: key, value: accountWithout(key as keyof typeof account) })))(
        'should reject a bank account without a key: $name',
        ({ value }) =>
        {
            // Act + Assert
            expect(isBankAccount(value)).toBe(false);
        },
    );

    it.for([
        { name: 'id as a string', value: { ...account, id: '3' } },
        { name: 'id as a fraction', value: { ...account, id: 3.5 } },
        { name: 'iban as null', value: { ...account, iban: null } },
        { name: 'label as a number', value: { ...account, label: 1 } },
    ])('should reject a bank account with a value of the wrong type: $name', ({ value }) =>
    {
        // Act + Assert
        expect(isBankAccount(value)).toBe(false);
    });

    it.for([
        { name: 'null', value: null },
        { name: 'an array', value: [account] },
        { name: 'a string', value: 'NL91ABNA0417164300' },
    ])('should reject a value that is not an object: $name', ({ value }) =>
    {
        // Act + Assert
        expect(isBankAccount(value)).toBe(false);
    });
});

describe('bank accounts service', () =>
{
    // Each test programs its own responses; none leak into the next.
    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should get /businesses/{id}/bank-accounts and return the list from the 200 (ok) response', async () =>
    {
        // Arrange
        vi.mocked(getRequest).mockResolvedValue({ data: [account, other] } as AxiosResponse);

        // Act
        const result = await listBankAccounts(7);

        // Assert
        expect(getRequest).toHaveBeenCalledExactlyOnceWith('/businesses/7/bank-accounts');
        expect(result).toStrictEqual([account, other]);
    });

    it.for([
        { name: 'one malformed account', data: [account, accountWithout('iban')] },
        { name: 'a wrapped list', data: { data: [account] } },
        { name: 'a single account', data: account },
    ])('should throw an UnexpectedResponseError when /businesses/{id}/bank-accounts answers with $name', async ({ data }) =>
    {
        // Arrange
        vi.mocked(getRequest).mockResolvedValue({ data } as AxiosResponse);

        // Act + Assert
        await expect(listBankAccounts(7)).rejects.toThrow(UnexpectedResponseError);
    });

    it('should post the payload to /businesses/{id}/bank-accounts and return the account from the 201 (created) response', async () =>
    {
        // Arrange
        vi.mocked(postRequest).mockResolvedValue({ data: account } as AxiosResponse);

        // Act
        const result = await createBankAccount(7, payload);

        // Assert
        expect(postRequest).toHaveBeenCalledExactlyOnceWith('/businesses/7/bank-accounts', payload);
        expect(result).toStrictEqual(account);
    });

    it('should put the label to /businesses/{id}/bank-accounts/{id} and return the account from the 200 (ok) response', async () =>
    {
        // Arrange
        const renamed = { ...account, label: 'Business' };
        vi.mocked(putRequest).mockResolvedValue({ data: renamed } as AxiosResponse);

        // Act
        const result = await updateBankAccountLabel(7, 3, labelPayload);

        // Assert
        expect(putRequest).toHaveBeenCalledExactlyOnceWith('/businesses/7/bank-accounts/3', labelPayload);
        expect(result).toStrictEqual(renamed);
    });

    it('should delete /businesses/{id}/bank-accounts/{id} and resolve without a value on the 204 (no content) response', async () =>
    {
        // Arrange
        vi.mocked(deleteRequest).mockResolvedValue({ data: '' } as AxiosResponse);

        // Act
        const result = await deleteBankAccount(7, 3);

        // Assert
        expect(deleteRequest).toHaveBeenCalledExactlyOnceWith('/businesses/7/bank-accounts/3');
        expect(result).toBeUndefined();
    });

    // One case per function: each must hand its own response to the check.
    it.for([
        { name: 'createBankAccount', send: () => createBankAccount(7, payload), endpoint: '/businesses/7/bank-accounts' },
        { name: 'updateBankAccountLabel', send: () => updateBankAccountLabel(7, 3, labelPayload), endpoint: '/businesses/7/bank-accounts/3' },
    ])('should throw an UnexpectedResponseError naming the endpoint when the account is malformed: $name', async ({ send, endpoint }) =>
    {
        // Arrange: every request function answers with an account missing its id
        const response = { data: accountWithout('id') } as AxiosResponse;
        vi.mocked(postRequest).mockResolvedValue(response);
        vi.mocked(putRequest).mockResolvedValue(response);

        // Act + Assert
        await expect(send()).rejects.toThrow(UnexpectedResponseError);
        await expect(send()).rejects.toThrow(`Unexpected response from ${endpoint}`);
    });
});
