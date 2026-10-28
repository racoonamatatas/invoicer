<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\Models\Business;
use LogicException;

final class UpdateBusinessRequest extends BusinessRequest
{
    /**
     * The bound {business}, left out of the kvk_number check so a business keeps its own number. The binding
     * has already proven it belongs to the user before this request is validated.
     */
    protected function existingBusiness(): Business
    {
        $business = $this->route('business');

        if (! $business instanceof Business)
        {
            throw new LogicException('UpdateBusinessRequest needs a bound {business} route parameter.');
        }

        return $business;
    }
}
