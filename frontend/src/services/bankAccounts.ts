import { isAxiosError } from 'axios';

import { checkResponse, deleteRequest, getRequest, postRequest, putRequest } from '@/services/http';

// A bank account as the backend sends it (BankAccountResourceData).
export interface BankAccount
{
    id: number;
    iban: string;
    label: string;
}

// What the add form sends. Keys match StoreBankAccountRequest's rules, so
// they are also the keys of a 422's errors. The IBAN goes as typed: the
// backend strips spaces and uppercases it, so the frontend has no IBAN rules.
export interface BankAccountPayload
{
    iban: string;
    label: string;
}

// An update may only rename: the backend prohibits `iban`. Pick, not Omit:
// a field added to the create payload stays out of here until added on
// purpose, and Pick rejects a misspelt key.
export type BankAccountLabelPayload = Pick<BankAccountPayload, 'label'>;

// Checked at runtime like isBusiness: the body came over the network, and
// TypeScript trusts the `value is` claim without verifying it. Extra keys
// pass, a missing key or a wrong type doesn't.
export const isBankAccount = (value: unknown): value is BankAccount =>
{
    return typeof value === 'object'
           && value !== null // typeof null is 'object'
           && 'id' in value && Number.isInteger(value.id)
           && 'iban' in value && typeof value.iban === 'string'
           && 'label' in value && typeof value.label === 'string';
};

const isBankAccountList = (value: unknown): value is BankAccount[] =>
{
    return Array.isArray(value) && value.every(isBankAccount);
};

const endpointFor = (businessId: number): string => `/businesses/${businessId}/bank-accounts`;

// A rename's 404: the account is gone (deleted in another tab, say). Its own
// class, so the page can tell it from other failures with instanceof and
// never reads a status code itself. The original 404 is kept as `cause`, like
// SessionEndedError.
export class BankAccountNotFoundError extends Error
{
    constructor(cause: unknown)
    {
        super('The bank account no longer exists', { cause });
        this.name = 'BankAccountNotFoundError';
    }
}

// A business's accounts, in the backend's order (label, then IBAN). A 404
// means the business isn't the user's, or no longer exists.
export const listBankAccounts = async (businessId: number): Promise<BankAccount[]> =>
{
    const endpoint = endpointFor(businessId);
    const response = await getRequest<unknown>(endpoint);

    return checkResponse(endpoint, response.data, isBankAccountList);
};

// 201 (created) with the account. A 422 is thrown, not caught, so useForm's
// submit() can show it next to the field.
export const createBankAccount = async (businessId: number, payload: BankAccountPayload): Promise<BankAccount> =>
{
    const endpoint = endpointFor(businessId);
    const response = await postRequest<BankAccountPayload, unknown>(endpoint, payload);

    return checkResponse(endpoint, response.data, isBankAccount);
};

// 200 (ok) with the renamed account. A 422 is thrown for useForm. A 404 (the
// account is gone) is a BankAccountNotFoundError: unlike a delete's, it means
// the new label was not saved.
export const updateBankAccountLabel = async (businessId: number, accountId: number, payload: BankAccountLabelPayload): Promise<BankAccount> =>
{
    const endpoint = `${endpointFor(businessId)}/${accountId}`;

    try
    {
        const response = await putRequest<BankAccountLabelPayload, unknown>(endpoint, payload);

        return checkResponse(endpoint, response.data, isBankAccount);
    }
    catch (error) // unknown: anything can be thrown
    {
        if (isAxiosError(error) && error.response?.status === 404)
        {
            throw new BankAccountNotFoundError(error);
        }

        throw error;
    }
};

// 204 (no content): nothing to check. A 404 counts as deleted too: the
// account is already gone (deleted in another tab, say), which is what the
// user asked for. Unlike a rename, where a 404 means the new label was not
// saved. Anything else is thrown.
export const deleteBankAccount = async (businessId: number, accountId: number): Promise<void> =>
{
    try
    {
        await deleteRequest<unknown>(`${endpointFor(businessId)}/${accountId}`);
    }
    catch (error) // unknown: anything can be thrown
    {
        if (isAxiosError(error) && error.response?.status === 404)
        {
            return;
        }

        throw error;
    }
};
