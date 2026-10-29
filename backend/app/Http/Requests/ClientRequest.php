<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\DataTransferObjects\Input\Client\ClientData;
use App\Validation\AddressRules;
use App\Validation\EuMemberStates;
use App\Validation\EuVatNumber;
use App\Validation\Normaliser;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Fluent;
use Illuminate\Validation\ConditionalRules;
use Illuminate\Validation\Rule;

/**
 * Validates a client for both create and update. The two take the same fields, all of them, because PUT replaces
 * the whole client.
 */
final class ClientRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * - email is kept as typed: nothing looks a client up by it, it is only shown and mailed to.
     * - The address can be in any country; its rules tighten when the country is NL.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'vat_number' => $this->vatNumberRules(),
            ...AddressRules::forAddress(),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'vat_number.prohibited' => 'A VAT number can only be given for a client in the EU.',
        ];
    }

    public function toDto(): ClientData
    {
        $safe = $this->safe();

        return new ClientData(
            name: $safe->string('name')->toString(),
            email: $safe->string('email')->toString(),
            vatNumber: $this->validatedStringOrNull('vat_number'),
            street: $safe->string('street')->toString(),
            houseNumber: $safe->string('house_number')->toString(),
            houseNumberAddition: $this->validatedStringOrNull('house_number_addition'),
            postalCode: $this->validatedStringOrNull('postal_code'),
            city: $safe->string('city')->toString(),
            region: $this->validatedStringOrNull('region'),
            countryCode: $safe->string('country_code')->toString(),
        );
    }

    /**
     * Puts the input in canonical form before any rule runs. The country code goes first: the postcode step reads it.
     *
     * - vat_number: spaces and dots removed, then uppercased, so "de 123.456.789" becomes DE123456789.
     * - postal_code: reformatted for NL only, the one country whose postcode shape is known here; "10115" or
     *   "SW1A 1AA" stays as typed.
     */
    protected function prepareForValidation(): void
    {
        $this->merge(['country_code' => Normaliser::uppercase($this->input('country_code'))]);
        $this->merge(['vat_number' => Normaliser::vatNumber($this->input('vat_number'))]);

        if ($this->input('country_code') === 'NL')
        {
            $this->merge(['postal_code' => Normaliser::dutchPostcode($this->input('postal_code'))]);
        }
    }

    /**
     * A VAT number is optional. For a client in an EU member state it must match that country's format; for any
     * other country it is prohibited.
     *
     * $euRules is a closure rather than a list: Laravel calls it during validation with the input wrapped in a
     * Fluent, so the rule is built for the submitted country. It only runs once $isEu has passed, so the country
     * always has a VAT format to look up.
     *
     * @return list<string|ConditionalRules>
     */
    private function vatNumberRules(): array
    {
        $isEu = static fn (Fluent $input): bool => is_string($input->get('country_code'))
            && EuMemberStates::contains($input->get('country_code'));

        $euRules = static fn (Fluent $input): array => [
            EuVatNumber::forCountry($input->string('country_code')->toString()),
        ];

        return ['nullable', 'string', Rule::when($isEu, $euRules, ['prohibited'])];
    }

    /**
     * Not $safe->string(): that turns null into "", and "?: null" afterwards would also turn "0" into null.
     */
    private function validatedStringOrNull(string $key): ?string
    {
        $value = $this->safe()->input($key);

        return is_string($value) ? $value : null;
    }
}
