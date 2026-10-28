<?php

declare(strict_types = 1);

namespace App\Actions\BankAccount;

use App\Models\BankAccount;
use App\Models\Business;
use Illuminate\Database\Eloquent\Collection;

/**
 * A business's bank accounts in display order: for the settings page now, and for the invoice form's picker
 * later, so the order is decided once.
 */
final readonly class ListBankAccountsAction
{
    /**
     * @return Collection<int, BankAccount>
     */
    public function execute(Business $business): Collection
    {
        return $business->bankAccounts()
            // lower(), as in ListBusinessesAction: SQLite's BINARY collation would put "Zakelijk" before "main".
            ->orderByRaw('lower(label)')
            // Labels are unique without case by the request's rule, but only "Main" and "main" saved at the same
            // instant would get past it; this keeps even those two in a fixed order.
            ->orderBy('iban')
            ->get();
    }
}
