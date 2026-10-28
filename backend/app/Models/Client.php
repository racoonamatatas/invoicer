<?php

declare(strict_types = 1);

namespace App\Models;

use Database\Factories\ClientFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Someone a business invoices, reached through /api/businesses/{business}/clients/{client}. The address can be in
 * any country; an invoice copies it into its snapshot on send, so editing a client never changes a sent invoice.
 */
// business_id is left out on purpose: the owner is set by the relation ($business->clients()->create()), never
// from input, so no request can move a client to another business. Factories ignore the list.
#[Fillable([
    'name',
    'email',
    'vat_number',
    'street',
    'house_number',
    'house_number_addition',
    'postal_code',
    'city',
    'region',
    'country_code',
])]
class Client extends Model
{
    /** @use HasFactory<ClientFactory> */
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     *
     * An explicit integer cast: business_id is compared with === once invoices check that their client belongs to
     * their business, and a driver that returns integers as strings must not break that.
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
