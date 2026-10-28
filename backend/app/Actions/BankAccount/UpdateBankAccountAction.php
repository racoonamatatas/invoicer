<?php

declare(strict_types = 1);

namespace App\Actions\BankAccount;

use App\Models\BankAccount;

final readonly class UpdateBankAccountAction
{
    /**
     * Renames the account. The label is all an update may change: the IBAN is fixed at creation, and the owner is
     * not fillable.
     */
    public function execute(BankAccount $bankAccount, string $label): BankAccount
    {
        $bankAccount->update(['label' => $label]);

        return $bankAccount;
    }
}
