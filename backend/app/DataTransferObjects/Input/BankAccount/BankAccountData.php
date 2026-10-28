<?php

declare(strict_types = 1);

namespace App\DataTransferObjects\Input\BankAccount;

/**
 * A new bank account as the create request hands it over: validated and in canonical form. Only a create has an
 * IBAN; an update changes the label alone.
 */
final readonly class BankAccountData
{
    public function __construct(
        public string $iban,
        public string $label,
    ) {}

    /**
     * @return array{iban: string, label: string}
     */
    public function toAttributes(): array
    {
        return [
            'iban' => $this->iban,
            'label' => $this->label,
        ];
    }
}
