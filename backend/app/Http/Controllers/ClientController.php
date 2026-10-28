<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\Client\ListClientsAction;
use App\Http\Resources\ClientResourceData;
use App\Models\Business;
use App\Models\Client;
use Illuminate\Http\JsonResponse;

/**
 * The {business} binding has already proven the business is the user's. Every query starts from that business, so
 * the client records of another business can't appear. The same person can be a client of two businesses; each
 * business then keeps its own record of them.
 */
final class ClientController extends Controller
{
    public function index(Business $business, ListClientsAction $action): JsonResponse
    {
        $clients = $action->execute($business)
            ->map(ClientResourceData::from(...))
            ->all();

        return new JsonResponse($clients);
    }

    /**
     * $client comes from the scoped binding, so it is one of this business's client records: the id of a client
     * record under another business was a 404 before this method ran.
     *
     * $business is unused but must be here: Laravel hands route parameters to a controller by position, not by
     * name, so without it the bound Business would land in $client and the call would be a TypeError.
     */
    public function show(Business $business, Client $client): ClientResourceData
    {
        return ClientResourceData::from($client);
    }
}
