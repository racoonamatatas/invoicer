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
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One KvK registration of a user. Every other resource (bank accounts, clients, invoices) hangs under a business
 * and is reached through /api/businesses/{business}/..., authorised by BusinessPolicy::access().
 *
 * The policy is named here rather than left to Laravel's auto-discovery (App\Models\X -> App\Policies\XPolicy).
 * The attribute only holds a class name, so a renamed or moved policy is not caught at boot; but the first
 * Gate::allows() check then throws, because the container can't build the class, instead of silently denying, which
 * is what auto-discovery does once the policy is no longer where the convention looks.
 */
#[UsePolicy(BusinessPolicy::class)]
// user_id is left out on purpose: the owner is set by the relation ($user->businesses()->create()), never from
// input, so no create or update request can hand a business to another user. Factories ignore the list.
#[Fillable([
    'registered_name',
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
     * returns integers as strings must not turn that into a 404 for every owner.
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

    /**
     * @return HasMany<BankAccount, $this>
     */
    public function bankAccounts(): HasMany
    {
        return $this->hasMany(BankAccount::class);
    }

    /**
     * @return HasMany<Client, $this>
     */
    public function clients(): HasMany
    {
        return $this->hasMany(Client::class);
    }
}
