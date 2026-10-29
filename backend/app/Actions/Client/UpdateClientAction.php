<?php

declare(strict_types = 1);

namespace App\Actions\Client;

use App\DataTransferObjects\Input\Client\ClientData;
use App\Models\Client;

final readonly class UpdateClientAction
{
    /**
     * Replaces every field of the client: the attributes include each column, nulls too, so a field left out of the
     * request is cleared rather than kept.
     */
    public function execute(Client $client, ClientData $data): Client
    {
        $client->update($data->toAttributes());

        return $client;
    }
}
