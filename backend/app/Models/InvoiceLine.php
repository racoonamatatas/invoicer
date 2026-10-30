<?php

declare(strict_types = 1);

namespace App\Models;

use App\Enums\VatOption;
use App\Invoicing\InvoiceLineAmounts;
use Database\Factories\InvoiceLineFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One billed item on an invoice. A draft's lines are deleted and recreated on every save, so a line's id means
 * nothing until the invoice is sent; position is what orders them.
 */
// invoice_id is left out on purpose: the owner is set by the relation ($invoice->lines()->create()), never from
// input. Factories ignore the list.
#[Fillable([
    'position',
    'description',
    'quantity_hundredths',
    'unit_price_cents',
    'vat_option',
])]
class InvoiceLine extends Model
{
    /** @use HasFactory<InvoiceLineFactory> */
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     *
     * The amounts are cast to integers because the totals take them as int, and a driver that returns strings would
     * fail strict_types there.
     *
     * The vat_option cast uses from(), so a stored integer no case backs throws a ValueError, which is a 500 on its
     * invoice's show. Left that way on purpose, as on Invoice: only corrupt data can cause it.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'invoice_id' => 'integer',
            'position' => 'integer',
            'quantity_hundredths' => 'integer',
            'unit_price_cents' => 'integer',
            'vat_option' => VatOption::class,
        ];
    }

    /**
     * The numbers of this line that the totals need.
     */
    public function toAmounts(): InvoiceLineAmounts
    {
        return new InvoiceLineAmounts($this->quantity_hundredths, $this->unit_price_cents, $this->vat_option);
    }

    /**
     * @return BelongsTo<Invoice, $this>
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
