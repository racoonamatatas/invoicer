<?php

declare(strict_types = 1);

namespace App\Actions\Business;

use App\DataTransferObjects\Input\Business\BusinessData;
use App\Models\Business;

final readonly class UpdateBusinessAction
{
    /**
     * Replaces every field the request validated. The owner stays: user_id is not in the attributes, nor fillable.
     */
    public function execute(Business $business, BusinessData $data): Business
    {
        $business->update($data->toAttributes());

        return $business;
    }
}
