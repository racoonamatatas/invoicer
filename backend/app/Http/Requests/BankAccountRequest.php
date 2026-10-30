<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\Models\BankAccount;
use App\Models\Business;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Translation\PotentiallyTranslatedString;
use LogicException;

/**
 * What creating and updating a bank account share: the bound business and the label rules. The IBAN rules are not
 * here, because only a create accepts an IBAN; an update prohibits one.
 */
abstract class BankAccountRequest extends FormRequest
{
    /**
     * The bank account being updated, or null when one is being created.
     */
    abstract protected function existingBankAccount(): ?BankAccount;

    /**
     * @return list<string|Closure(string, mixed, Closure(string, ?string=): PotentiallyTranslatedString): void>
     */
    protected function labelRules(): array
    {
        return [
            'required',
            'string',
            'max:255',
            // Not Rule::unique: that compares with "=", which is case-sensitive on SQLite and case-insensitive on
            // MySQL, so "Main" next to "main" would pass the rule here and hit the index as a 500 there. lower() on
            // both sides decides it the same way on every driver. SQLite's lower() folds ASCII only, so "Één" and
            // "één" still count as two labels there; fine for a name only the user sees.
            $this->failWhenLabelTaken(...),
        ];
    }

    /**
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail  typed as in ValidationRule::validate()
     */
    private function failWhenLabelTaken(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value))
        {
            return; // the string rule above has already failed
        }

        $taken = $this->business()->bankAccounts()
            ->whereRaw('lower(label) = lower(?)', [$value])
            ->when($this->existingBankAccount(), fn ($query, BankAccount $account) => $query->whereKeyNot($account->id))
            ->exists();

        if ($taken)
        {
            $fail('validation.unique')->translate();
        }
    }

    /**
     * The bound {business}. The binding has already proven it belongs to the user before this request is validated.
     */
    protected function business(): Business
    {
        $business = $this->route('business');

        if (! $business instanceof Business)
        {
            throw new LogicException('A bank account request needs a bound {business} route parameter.');
        }

        return $business;
    }
}
