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
            // The query as well as isCausedBy(): an identical double submit breaks both unique indexes at once,
            // and which one the driver reports is up to the driver (SQLite names the label). If the IBAN is in
            // the business now, the IBAN was the duplicate, whatever the message says.
            if (DuplicateIbanException::isCausedBy($exception) || $business->bankAccounts()->where('iban', $data->iban)->exists())
            {
                throw new DuplicateIbanException($exception);
            }

            throw $exception;
        }
    }
}
