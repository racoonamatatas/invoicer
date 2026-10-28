<?php

declare(strict_types = 1);

namespace App\Actions\BankAccount;

use App\Models\BankAccount;

final readonly class DeleteBankAccountAction
{
    /**
     * Nothing points at a bank account yet. Once invoices do, an account an invoice uses can't be deleted, and
     * this action refuses it with a 409 instead of letting the foreign key throw.
     */
    public function execute(BankAccount $bankAccount): void
    {
        $bankAccount->delete();
    }
}
