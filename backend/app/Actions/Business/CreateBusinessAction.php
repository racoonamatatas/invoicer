<?php

declare(strict_types = 1);

namespace App\Actions\Business;

use App\DataTransferObjects\Input\Business\BusinessData;
use App\Models\Business;
use App\Models\User;

final readonly class CreateBusinessAction
{
    public function execute(User $owner, BusinessData $data): Business
    {
        // Through the relation: user_id is not fillable, so this is the only way an owner is set.
        return $owner->businesses()->create($data->toAttributes());
    }
}
