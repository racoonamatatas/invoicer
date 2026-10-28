<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\DataTransferObjects\Input\BankAccount\BankAccountData;
use App\Validation\Iban;
use App\Validation\Normaliser;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

final class StoreBankAccountRequest extends BankAccountRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'iban' => [
                'required',
                'string',
                new Iban,
                // Once per business, matching the (business_id, iban) index: a double submit is a 422 here rather
                // than a 500 from the index. A plain "=" is right here, unlike for the label: after the normaliser
                // every IBAN is uppercase, so there is no case to disagree about.
                // Not Rule::unique: the message names the account the IBAN is saved under, so the user can find it.
                // Only the backend can say which one: it alone normalises IBANs. The label is the user's own, from
                // a business the binding has proven is theirs.
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! is_string($value))
                    {
                        return; // the string rule above has already failed
                    }

                    $existing = $this->business()->bankAccounts()->where('iban', $value)->first();

                    if ($existing !== null)
                    {
                        $fail("This IBAN has previously been saved as \"{$existing->label}\".");
                    }
                },
            ],
            'label' => $this->labelRules(),
        ];
    }

    public function toDto(): BankAccountData
    {
        $safe = $this->safe();

        return new BankAccountData(
            iban: $safe->string('iban')->toString(),
            label: $safe->string('label')->toString(),
        );
    }

    /**
     * Nothing to leave out of the label check: the account doesn't exist yet.
     */
    protected function existingBankAccount(): null
    {
        return null;
    }

    /**
     * Canonical form before any rule runs, so Iban, unique and the stored value all see "NL91ABNA0417164300".
     */
    protected function prepareForValidation(): void
    {
        $this->merge(['iban' => Normaliser::iban($this->input('iban'))]);
    }
}
