<?php

declare(strict_types = 1);

namespace App\Models;

use Database\Factories\BankAccountFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An account a business is paid into, reached through /api/businesses/{business}/bank-accounts/{bankAccount}.
 *
 * The IBAN never changes after creation; only the label does. An invoice points at the row, so editing the IBAN
 * in place would quietly send every draft's payments somewhere else. A new IBAN is a new account.
 */
// business_id is left out on purpose: the owner is set by the relation ($business->bankAccounts()->create()),
// never from input, so no request can move an account to another business. Factories ignore the list.
#[Fillable([
    'iban',
    'label',
])]
class BankAccount extends Model
{
    /** @use HasFactory<BankAccountFactory> */
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     *
     * An explicit integer cast, as on Business: business_id is compared with === once invoices check that their
     * bank account belongs to their business, and a driver that returns strings must not break that.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'business_id' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Business, $this>
     */
    public function business(): BelongsTo
    {
        return $this->belongsTo(Business::class);
    }
}
