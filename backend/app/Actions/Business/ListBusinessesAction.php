<?php

declare(strict_types = 1);

namespace App\Actions\Business;

use App\Models\Business;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

/**
 * A user's businesses in display order: for the list page now, and for any later picker that needs the same
 * list, so the order is decided once.
 */
final readonly class ListBusinessesAction
{
    /**
     * @return Collection<int, Business>
     */
    public function execute(User $user): Collection
    {
        return $user->businesses()
            ->orderBy('legal_name')
            ->orderBy('id') // two businesses with one name still list in a fixed order
            ->get();
    }
}
