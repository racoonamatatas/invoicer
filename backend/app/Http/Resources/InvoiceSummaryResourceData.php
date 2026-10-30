<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use App\Models\Invoice;
use Illuminate\Contracts\Support\Responsable;
use JsonSerializable;

/**
 * An invoice as the invoices list sees it: no lines and no totals. A separate class from the full invoice, so the
 * list can't start loading lines by accident. An allowlist, like every resource: a new column stays private until it
 * is added here. business_id is left out: the URL the frontend asked already holds it.
 */
final readonly class InvoiceSummaryResourceData implements JsonSerializable, Responsable
{
    use RespondsWithJson;

    public function __construct(
        public int $id,
        public string $status,
        public string $vatTreatment,
        public ?string $number,
        public int $clientId,
        public int $bankAccountId,
        public ?int $paymentTermDays,
    ) {}

    public static function from(Invoice $invoice): self
    {
        return new self(
            id: $invoice->id,
            status: $invoice->status->apiName(),
            vatTreatment: $invoice->vat_treatment->apiName(),
            number: $invoice->number,
            clientId: $invoice->client_id,
            bankAccountId: $invoice->bank_account_id,
            paymentTermDays: $invoice->payment_term_days,
        );
    }

    /**
     * @return array{
     *     id: int,
     *     status: string,
     *     vat_treatment: string,
     *     number: ?string,
     *     client_id: int,
     *     bank_account_id: int,
     *     payment_term_days: ?int,
     * }
     */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'status' => $this->status,
            'vat_treatment' => $this->vatTreatment,
            'number' => $this->number,
            'client_id' => $this->clientId,
            'bank_account_id' => $this->bankAccountId,
            'payment_term_days' => $this->paymentTermDays,
        ];
    }
}
