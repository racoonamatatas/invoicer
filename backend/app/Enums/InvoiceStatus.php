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
}
