<?php

declare(strict_types = 1);

namespace App\DataTransferObjects\Input\Invoice;

use App\Enums\VatOption;
use App\Enums\VatTreatment;
use LogicException;

/**
 * A draft invoice with its lines, as the create and update requests hand it over: validated, with the API names
 * already turned into enum cases.
 */
final readonly class InvoiceData
{
    /**
     * Refuses a line whose VAT option doesn't fit the treatment, so such a draft is never stored: its totals can't
     * be computed, so every later read of it would be a 500. The request validates this first, so this firing means
     * a bug.
     *
     * @param  list<InvoiceLineData>  $lines
     *
     * @throws LogicException
     */
    public function __construct(
        public int $clientId,
        public int $bankAccountId,
        public VatTreatment $vatTreatment,
        public ?int $paymentTermDays, // null: the business's default applies
        public array $lines,
    ) {
        foreach ($lines as $line)
        {
            if ($vatTreatment->chargesVat() !== ($line->vatOption !== null))
            {
                throw new LogicException("A line's VAT option doesn't fit the invoice's treatment, {$vatTreatment->name}.");
            }
        }
    }

    /**
     * The invoice's own columns. Not status: a create sets that itself, and an update never changes it.
     *
     * @return array{client_id: int, bank_account_id: int, vat_treatment: VatTreatment, payment_term_days: ?int}
     */
    public function toAttributes(): array
    {
        return [
            'client_id' => $this->clientId,
            'bank_account_id' => $this->bankAccountId,
            'vat_treatment' => $this->vatTreatment,
            'payment_term_days' => $this->paymentTermDays,
        ];
    }

    /**
     * The lines' attributes, numbered 1, 2, 3… in the order the request sent them. Create and update both number the
     * lines here, so the two can't disagree on where position 1 is.
     *
     * @return list<array{position: int, description: string, quantity_hundredths: int, unit_price_cents: int, vat_option: ?VatOption}>
     */
    public function lineAttributes(): array
    {
        return array_map(
            static fn (InvoiceLineData $line, int $index): array => $line->toAttributes($index + 1),
            $this->lines,
            array_keys($this->lines),
        );
    }
}
