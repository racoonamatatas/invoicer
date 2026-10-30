<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use App\Invoicing\InvoiceTotals;
use App\Invoicing\VatGroupTotal;
use JsonSerializable;

/**
 * An invoice's totals as the frontend sees them, in cents. The frontend shows these and never adds them up itself, so
 * the rounding lives in one place: InvoiceTotals.
 */
final readonly class InvoiceTotalsResourceData implements JsonSerializable
{
    /**
     * @param  list<array{vat_option: string, rate_percent: ?int, base_cents: int, vat_cents: int}>  $vatGroups
     */
    public function __construct(
        public int $subtotalCents,
        public array $vatGroups,
        public int $vatCents,
        public int $totalCents,
    ) {}

    public static function from(InvoiceTotals $totals): self
    {
        return new self(
            subtotalCents: $totals->subtotalCents,
            // rate_percent is sent, not looked up by the frontend, so the rates stay Dutch law in one place. Null for
            // exempt, which has no rate.
            vatGroups: array_map(static fn (VatGroupTotal $group): array => [
                'vat_option' => $group->option->apiName(),
                'rate_percent' => $group->option->ratePercent(),
                'base_cents' => $group->baseCents,
                'vat_cents' => $group->vatCents,
            ], $totals->vatGroups),
            vatCents: $totals->vatCents,
            totalCents: $totals->totalCents,
        );
    }

    /**
     * @return array{
     *     subtotal_cents: int,
     *     vat_groups: list<array{vat_option: string, rate_percent: ?int, base_cents: int, vat_cents: int}>,
     *     vat_cents: int,
     *     total_cents: int,
     * }
     */
    public function jsonSerialize(): array
    {
        return [
            'subtotal_cents' => $this->subtotalCents,
            'vat_groups' => $this->vatGroups,
            'vat_cents' => $this->vatCents,
            'total_cents' => $this->totalCents,
        ];
    }
}
