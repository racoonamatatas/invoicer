<?php

declare(strict_types = 1);

namespace App\Actions\Business;

use App\DataTransferObjects\Input\Business\BusinessData;
use App\Exceptions\Business\DuplicateKvkNumberException;
use App\Models\Business;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;

final readonly class CreateBusinessAction
{
    /**
     * @throws DuplicateKvkNumberException when another request created the same business after this one was validated
     */
    public function execute(User $owner, BusinessData $data): Business
    {
        try
        {
            // Through the relation: user_id is not fillable, so this is the only way an owner is set.
            return $owner->businesses()->create($data->toAttributes());
        }
        catch (UniqueConstraintViolationException $exception)
        {
            throw DuplicateKvkNumberException::from($exception);
        }
    }
}
