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
 * Creating and updating a client, in one class: unlike a business, a client has no uniqueness rule that needs to
 * know which record is being updated, so the two requests would be identical.
 */
final class ClientRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * - email is kept as typed, unlike a login email: nothing looks a client up by it.
     * - The address rules are used unchanged: a client's address can be in any country, tightened for NL.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
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
            email: $this->validatedStringOrNull('email'),
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
     * Canonical form before any rule runs, step by step rather than a map of normalisers as in BusinessRequest,
     * because the postcode step reads the country code the first step has just uppercased.
     *
     * - vat_number: spaces and dots out, then uppercase, so "de 123.456.789" is DE123456789. Normaliser::btwId() is
     *   named for the Dutch number, but nothing in it is Dutch.
     * - postal_code: only a Dutch postcode has a known shape; a German "10115" or a British "SW1A 1AA" stays as typed.
     */
    protected function prepareForValidation(): void
    {
        $this->merge(['country_code' => Normaliser::uppercase($this->input('country_code'))]);
        $this->merge(['vat_number' => Normaliser::btwId($this->input('vat_number'))]);

        if ($this->input('country_code') === 'NL')
        {
            $this->merge(['postal_code' => Normaliser::dutchPostcode($this->input('postal_code'))]);
        }
    }

    /**
     * A VAT number is optional for every client, checked against the client's country when it is an EU member state,
     * and prohibited for any other country.
     *
     * The rules for the EU case are a closure, not a list: Laravel calls it with the input wrapped in a Fluent
     * (ConditionalRules::rules()), so the rule is built for the submitted country. It only runs for a member state,
     * which is why EuVatNumber::forCountry() can't throw here.
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
