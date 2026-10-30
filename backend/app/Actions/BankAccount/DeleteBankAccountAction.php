<?php

declare(strict_types = 1);

namespace App\Actions\BankAccount;

use App\Exceptions\BankAccount\BankAccountInUseException;
use App\Models\BankAccount;

final readonly class DeleteBankAccountAction
{
    /**
     * Refuses an account an invoice uses before the foreign key would: the key's restrictOnDelete throws a raw
     * QueryException, which would be a 500. The key stays as the last line: an invoice created between this check
     * and the delete still can't lose its account, it only gets the 500.
     *
     * @throws BankAccountInUseException
     */
    public function execute(BankAccount $bankAccount): void
    {
        if ($bankAccount->invoices()->exists())
        {
            throw new BankAccountInUseException;
        }

        $bankAccount->delete();
    }
}
