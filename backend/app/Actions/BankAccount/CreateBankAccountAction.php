<?php

declare(strict_types = 1);

namespace App\Actions\BankAccount;

use App\DataTransferObjects\Input\BankAccount\BankAccountData;
use App\Exceptions\BankAccount\DuplicateIbanException;
use App\Models\BankAccount;
use App\Models\Business;
use Illuminate\Database\UniqueConstraintViolationException;

final readonly class CreateBankAccountAction
{
    /**
     * @throws DuplicateIbanException when another request added the same IBAN after this one was validated
     */
    public function execute(Business $business, BankAccountData $data): BankAccount
    {
        try
        {
            // Through the relation: business_id is not fillable, so this is the only way an owner is set.
            return $business->bankAccounts()->create($data->toAttributes());
        }
        catch (UniqueConstraintViolationException $exception)
        {
            if (DuplicateIbanException::isCausedBy($exception))
            {
                throw new DuplicateIbanException($exception);
            }

            throw $exception;
        }
    }
}
