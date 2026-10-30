<?php

declare(strict_types = 1);

namespace App\Models;

use App\Enums\VatOption;
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
     * @return BelongsTo<Invoice, $this>
     */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }
}
