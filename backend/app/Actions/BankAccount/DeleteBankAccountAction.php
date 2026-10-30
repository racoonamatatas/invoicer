<?php

declare(strict_types = 1);

namespace App\Actions\BankAccount;

use App\Exceptions\BankAccount\BankAccountInUseException;
use App\Models\BankAccount;
use Illuminate\Database\QueryException;

final readonly class DeleteBankAccountAction
{
    /**
     * Refuses an account an invoice uses. Asking first answers the common case without relying on a driver's error
     * message. The foreign key's restrictOnDelete still has the last word: an invoice created between the check and the
     * delete makes the delete fail, and that failure is turned into the same refusal rather than a raw 500.
     *
     * @throws BankAccountInUseException
     */
    public function execute(BankAccount $bankAccount): void
    {
        if ($bankAccount->invoices()->exists())
        {
            throw new BankAccountInUseException;
        }

        try
        {
            $bankAccount->delete();
        }
        catch (QueryException $exception)
        {
            // Only the foreign key's refusal: any other failure is a real error and stays a 500.
            if (! BankAccountInUseException::isCausedBy($exception))
            {
                throw $exception;
            }

            throw new BankAccountInUseException($exception);
        }
    }
}
