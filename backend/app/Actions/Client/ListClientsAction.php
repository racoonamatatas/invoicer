<?php

declare(strict_types = 1);

namespace App\Actions\Client;

use App\Models\Business;
use App\Models\Client;
use Illuminate\Database\Eloquent\Collection;

/**
 * A business's clients in display order: for the clients page now, and for the invoice form's picker later, so the
 * order is decided once.
 */
final readonly class ListClientsAction
{
    /**
     * @return Collection<int, Client>
     */
    public function execute(Business $business): Collection
    {
        return $business->clients()
            // lower(): SQLite's BINARY collation sorts every capital before every lowercase letter, which would put
            // "de Vries" after "Zwart". SQLite's lower() only folds ASCII, so "Émile" still sorts after "Zwart"; a
            // proper fix needs a collation, which isn't worth it for a short list of clients.
            ->orderByRaw('lower(name)')
            // Names aren't unique (two clients called Jansen are normal), so the id keeps those in a fixed order:
            // the one added first comes first.
            ->orderBy('id')
            ->get();
    }
}
