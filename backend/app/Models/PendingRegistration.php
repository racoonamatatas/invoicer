<?php

declare(strict_types = 1);

namespace App\Models;

use Database\Factories\PendingRegistrationFactory;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Prunable;

/**
 * A signup whose inbox owner hasn't set a name and password yet. The user row only exists once they have.
 */
#[Hidden(['token'])]
class PendingRegistration extends Model
{
    /** @use HasFactory<PendingRegistrationFactory> */
    use HasFactory;

    use Prunable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'immutable_datetime',
        ];
    }

    /**
     * Rows that model:prune deletes: an expired link can't be used, so its row only leaks who tried to sign up.
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        return static::query()->where('expires_at', '<=', now());
    }
}
