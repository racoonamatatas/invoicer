<?php

declare(strict_types = 1);

namespace App\Actions\BankAccount;

use App\Models\BankAccount;

final readonly class DeleteBankAccountAction
{
    /**
     * A plain delete, because nothing points at a bank account yet. Once invoices do, this action will have to
     * refuse an account an invoice uses with a 409, before the foreign key throws.
     */
    public function execute(BankAccount $bankAccount): void
    {
        $bankAccount->delete();
    }
}
