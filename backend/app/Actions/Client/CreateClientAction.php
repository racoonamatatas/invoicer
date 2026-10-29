<?php

declare(strict_types = 1);

namespace App\Actions\Client;

use App\DataTransferObjects\Input\Client\ClientData;
use App\Models\Business;
use App\Models\Client;

final readonly class CreateClientAction
{
    /**
     * Creates the client through the business's relation, which sets business_id: the column is not fillable, so no
     * input can put a client under another business.
     */
    public function execute(Business $business, ClientData $data): Client
    {
        return $business->clients()->create($data->toAttributes());
    }
}
