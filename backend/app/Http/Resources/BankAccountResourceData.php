<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use App\Models\BankAccount;
use Illuminate\Contracts\Support\Responsable;
use JsonSerializable;

/**
 * A bank account as the frontend sees it. An allowlist, like BusinessResourceData: a new column on bank_accounts
 * stays private until it is added here. business_id is left out: the URL the client asked already holds it.
 */
final readonly class BankAccountResourceData implements JsonSerializable, Responsable
{
    use RespondsWithJson;

    public function __construct(
        public int $id,
        public string $iban,
        public string $label,
    ) {}

    public static function from(BankAccount $bankAccount): self
    {
        return new self(
            id: $bankAccount->id,
            iban: $bankAccount->iban,
            label: $bankAccount->label,
        );
    }

    /**
     * @return array{id: int, iban: string, label: string}
     */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'iban' => $this->iban,
            'label' => $this->label,
        ];
    }
}
