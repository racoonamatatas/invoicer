<?php

declare(strict_types = 1);

namespace App\Models;

use App\Enums\InvoiceStatus;
use App\Enums\VatTreatment;
use App\Invoicing\InvoiceLineAmounts;
use App\Invoicing\InvoiceTotals;
use Database\Factories\InvoiceFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An invoice of a business, reached through /api/businesses/{business}/invoices/{invoice}. While it's a draft, it
 * stores no totals: they're computed from its lines on every read.
 */
// business_id, status, number and version are left out on purpose: the owner is set by the relation
// ($business->invoices()->create()), and the status, number and version by the code that creates, saves or sends an
// invoice, never from input. Factories ignore the list.
#[Fillable([
    'client_id',
    'bank_account_id',
    'vat_treatment',
    'payment_term_days',
])]
class Invoice extends Model
{
    /** @use HasFactory<InvoiceFactory> */
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     *
     * Explicit integer casts on the keys, as on Client: they are compared with === when an invoice checks that its
     * client and bank account belong to its business.
     *
     * The enum casts use from(), so a stored integer no case backs throws a ValueError, which is a 500. Left that way
     * on purpose: only corrupt data can cause it, and a loud, reported error beats a guess at what it meant. Note
     * the reach: one such row breaks the whole invoices list of its business, not only its own show.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'business_id' => 'integer',
            'client_id' => 'integer',
            'bank_account_id' => 'integer',
            'status' => InvoiceStatus::class,
            'vat_treatment' => VatTreatment::class,
            'payment_term_days' => 'integer',
            'version' => 'integer',
        ];
    }

    /**
     * Computed on every call, never stored: a draft's lines change on every save, and a stored total could drift from
     * them. Reads the lines relation, so a caller that eager-loaded the lines pays no extra query.
     */
    public function totals(): InvoiceTotals
    {
        return InvoiceTotals::fromLines(
            $this->vat_treatment,
            $this->lines->map(static fn (InvoiceLine $line): InvoiceLineAmounts => $line->toAmounts())->values()->all(),
        );
    }

    /**
     * @return BelongsTo<Business, $this>
     */
    public function business(): BelongsTo
    {
        return $this->belongsTo(Business::class);
    }

    /**
     * @return BelongsTo<Client, $this>
     */
    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    /**
     * @return BelongsTo<BankAccount, $this>
     */
    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class);
    }

    /**
     * Ordered by position in the relation itself, so no read can forget the order: without an ORDER BY the database
     * may return rows in any order.
     *
     * @return HasMany<InvoiceLine, $this>
     */
    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceLine::class)->orderBy('position');
    }
}
