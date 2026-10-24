<?php

declare(strict_types = 1);

namespace App\Models;

use App\Policies\BusinessPolicy;
use Database\Factories\BusinessFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\UsePolicy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One KvK registration of a user. Every other resource (bank accounts, clients, invoices) hangs under a business
 * and is reached through /api/businesses/{business}/..., authorised by BusinessPolicy::access().
 *
 * The policy is named here rather than left to Laravel's auto-discovery (App\Models\X -> App\Policies\XPolicy):
 * a renamed or moved policy then fails loudly at boot instead of silently leaving the model without one, where
 * every ->can() check would deny.
 */
#[UsePolicy(BusinessPolicy::class)]
#[Fillable([
    'user_id',
    'legal_name',
    'kvk_number',
    'vat_number',
    'street',
    'house_number',
    'house_number_addition',
    'postal_code',
    'city',
    'region',
    'country_code',
    'payment_term_days',
])]
class Business extends Model
{
    /** @use HasFactory<BusinessFactory> */
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     *
     * Explicit integer casts: the policy compares user_id with === to the user's id, and a database driver that
     * returns integers as strings must not turn that into a 403 for everyone.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'payment_term_days' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
