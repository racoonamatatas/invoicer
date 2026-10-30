<?php

declare(strict_types = 1);

namespace App\Enums;

/**
 * Where an invoice is in its life. Only Draft exists for now: sent and paid arrive with sending, together with the
 * rules for what each status still allows.
 *
 * The backing integers are what invoices.status stores, so they are a storage format, not an order: never renumber or
 * reuse one. They start at 1 so a stray 0 can't pass for a status.
 */
enum InvoiceStatus: int
{
    case Draft = 1;

    /**
     * What the API sends and accepts for this status. Not the backing integer, which is a storage format, and not
     * derived from the case name, so renaming a case can't change the API.
     */
    public function apiName(): string
    {
        // No default arm: a new case throws an UnhandledMatchError until it has a name on the wire.
        return match ($this)
        {
            self::Draft => 'draft',
        };
    }
}
