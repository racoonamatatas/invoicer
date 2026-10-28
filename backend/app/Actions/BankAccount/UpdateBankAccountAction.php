<?php

declare(strict_types = 1);

namespace App\Actions\BankAccount;

use App\Models\BankAccount;

final readonly class UpdateBankAccountAction
{
    /**
     * Renames the account. The label is all an update may change: the IBAN is fixed at creation, and the owner is
     * not fillable.
     *
     * Two renames to one label at the same instant both pass the request's rule, and the second breaks the
     * (business_id, label) index as a 500. Left that way on purpose, as on create (see DuplicateIbanException):
     * rare, harmless, and nothing is saved.
     */
    public function execute(BankAccount $bankAccount, string $label): BankAccount
    {
        $bankAccount->update(['label' => $label]);

        return $bankAccount;
    }
}
