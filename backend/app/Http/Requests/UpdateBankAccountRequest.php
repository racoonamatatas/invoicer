<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\Models\BankAccount;
use App\Validation\Normaliser;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use LogicException;

final class UpdateBankAccountRequest extends BankAccountRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // The IBAN never changes after creation (see BankAccount). Optional, so a body with the label alone is
            // fine; but when sent it must be the stored one, so a client that PUTs back the whole account it got
            // from GET passes, and one that thinks it changed the IBAN hears that it didn't. Not left out of the
            // rules: a left-out field is dropped without a word. null is a different value, and fails too.
            'iban' => [
                'sometimes',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if ($value !== $this->existingBankAccount()->iban)
                    {
                        $fail('The :attribute can\'t be changed.');
                    }
                },
            ],
            'label' => $this->labelRules(),
        ];
    }

    /**
     * Only the label: a DTO for one string would add nothing.
     */
    public function label(): string
    {
        return $this->safe()->string('label')->toString();
    }

    /**
     * The bound {bankAccount}, left out of the label check so an account keeps its own label. The scoped binding
     * has already proven it belongs to the business in the URL.
     */
    protected function existingBankAccount(): BankAccount
    {
        $bankAccount = $this->route('bankAccount');

        if (! $bankAccount instanceof BankAccount)
        {
            throw new LogicException('UpdateBankAccountRequest needs a bound {bankAccount} route parameter.');
        }

        return $bankAccount;
    }

    /**
     * The same canonical form as on create, so "nl91 abna 0417 1643 00" counts as the stored NL91ABNA0417164300.
     * Only when sent: merging a null for a missing iban would turn "label only" into "iban changed to null".
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('iban'))
        {
            $this->merge(['iban' => Normaliser::iban($this->input('iban'))]);
        }
    }
}
