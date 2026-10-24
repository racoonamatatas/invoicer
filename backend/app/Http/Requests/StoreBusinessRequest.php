<?php

declare(strict_types = 1);

namespace App\Http\Requests;

final class StoreBusinessRequest extends BusinessRequest
{
    /**
     * Nothing to leave out of the kvk_number check: the business doesn't exist yet.
     */
    protected function existingBusiness(): null
    {
        return null;
    }
}
