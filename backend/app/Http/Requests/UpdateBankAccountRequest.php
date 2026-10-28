<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\Models\BankAccount;
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
            // The IBAN never changes after creation (see BankAccount). prohibited rather than left out of the
            // rules: a left-out field is dropped without a word, and a client that thinks it changed the IBAN
            // must hear that it didn't.
            'iban' => ['prohibited'],
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
}
