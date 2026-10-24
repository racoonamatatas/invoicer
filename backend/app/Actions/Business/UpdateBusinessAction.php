<?php

declare(strict_types = 1);

namespace App\Actions\Business;

use App\DataTransferObjects\Input\Business\BusinessData;
use App\Exceptions\Business\DuplicateKvkNumberException;
use App\Models\Business;
use Illuminate\Database\UniqueConstraintViolationException;

final readonly class UpdateBusinessAction
{
    /**
     * Replaces every field the request validated. The owner stays: user_id is not in the attributes, nor fillable.
     *
     * @throws DuplicateKvkNumberException when another request took this kvk_number after this one was validated
     */
    public function execute(Business $business, BusinessData $data): Business
    {
        try
        {
            $business->update($data->toAttributes());
        }
        catch (UniqueConstraintViolationException $exception)
        {
            throw DuplicateKvkNumberException::from($exception);
        }

        return $business;
    }
}
