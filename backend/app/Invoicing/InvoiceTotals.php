<?php

declare(strict_types = 1);

namespace App\Invoicing;

use App\Enums\VatOption;
use App\Enums\VatTreatment;
use InvalidArgumentException;

/**
 * An invoice's subtotal, VAT per group and total, all in cents. A draft doesn't store these: they're computed from its
 * lines on every read, so there is one source of truth until sending freezes them.
 *
 * The constructor is private so the numbers always add up: fromLines() is the only way in.
 */
final readonly class InvoiceTotals
{
    /**
     * @param  list<VatGroupTotal>  $vatGroups
     */
    private function __construct(
        public int $subtotalCents,
        public array $vatGroups,
        public int $totalCents,
    ) {}

    /**
     * Refuses a line whose VAT option doesn't fit the treatment, rather than ignoring it or counting it as zero: a
     * silent zero would hide the mistake in a total that looks right. The request validates this first, so this firing
     * means a bug, hence a plain InvalidArgumentException and no HTTP mapping.
     *
     * @param  list<InvoiceLineAmounts>  $lines
     *
     * @throws InvalidArgumentException
     */
    public static function fromLines(VatTreatment $treatment, array $lines): self
    {
        foreach ($lines as $index => $line)
        {
            // Counted from 1, so the message names the line the way a person sees it on the invoice.
            $position = $index + 1;

            if ($treatment->chargesVat() && $line->vatOption === null)
            {
                throw new InvalidArgumentException("Line {$position} needs a VAT option, because the invoice's treatment is {$treatment->name}.");
            }

            if (! $treatment->chargesVat() && $line->vatOption !== null)
            {
                throw new InvalidArgumentException("Line {$position} can't have a VAT option, because the invoice's treatment is {$treatment->name}.");
            }
        }

        $subtotalCents = self::sumLineTotals($lines);

        if (! $treatment->chargesVat())
        {
            return new self($subtotalCents, [], $subtotalCents);
        }

        // Loop over the options, not the lines, so the groups come out in one fixed order (High, Low, Zero, Exempt)
        // whatever order the lines are in.
        $vatGroups = [];
        foreach (VatOption::cases() as $option)
        {
            $groupLines = array_filter($lines, static fn (InvoiceLineAmounts $line): bool => $line->vatOption === $option);
            if ($groupLines === [])
            {
                continue;
            }

            $vatGroups[] = VatGroupTotal::forBase($option, self::sumLineTotals($groupLines));
        }

        $vatCents = array_sum(array_map(static fn (VatGroupTotal $group): int => $group->vatCents, $vatGroups));

        return new self($subtotalCents, $vatGroups, $subtotalCents + $vatCents);
    }

    /**
     * @param  array<InvoiceLineAmounts>  $lines
     */
    private static function sumLineTotals(array $lines): int
    {
        return array_sum(array_map(static fn (InvoiceLineAmounts $line): int => $line->totalCents(), $lines));
    }
}
