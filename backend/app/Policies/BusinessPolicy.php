<?php

declare(strict_types = 1);

namespace App\Policies;

use App\Models\Business;
use App\Models\User;

/**
 * Registered on the model through #[UsePolicy], see Business.
 */
final class BusinessPolicy
{
    /**
     * The one check every business-scoped route makes, in the {business} binding (AppServiceProvider): the
     * business belongs to the logged-in user. There is no finer-grained view/update split, because an owner may
     * do everything with their own business and nobody else may do anything with it.
     */
    public function access(User $user, Business $business): bool
    {
        return $business->user_id === $user->id;
    }
}
