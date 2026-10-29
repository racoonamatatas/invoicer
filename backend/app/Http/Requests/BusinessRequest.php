<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\DataTransferObjects\Input\Business\BusinessData;
use App\Models\Business;
use App\Models\User;
use App\Validation\AddressRules;
use App\Validation\Country\Netherlands\BtwId;
use App\Validation\Country\Netherlands\KvkNumber;
use App\Validation\Normaliser;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use LogicException;

/**
 * The rules, normalising and DTO that creating and updating a business share. The two requests differ in one
 * thing only: which business, if any, the kvk_number uniqueness check leaves out.
 */
abstract class BusinessRequest extends FormRequest
{
    /**
     * The business being updated, or null when one is being created.
     */
    abstract protected function existingBusiness(): ?Business;

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'registered_name' => ['required', 'string', 'max:255'],
            'kvk_number' => [
                'required',
                'string',
                new KvkNumber,
                // Once per user, matching the (user_id, kvk_number) index: a double submit is a 422 here rather
                // than a 500 from the index. Not unique across users on purpose: two accounts may hold the same
                // registration (an accountant's test data, a business handed over to someone else). Whether that
                // should change once ownership can be proven is open in INV-0061.
                Rule::unique('businesses', 'kvk_number')
                    ->where('user_id', $this->owner()->id)
                    ->ignore($this->existingBusiness()),
            ],
            'vat_number' => ['required', 'string', new BtwId],
            ...AddressRules::forAddress(),
            // A business is a KvK registration, so its address is Dutch; AddressRules alone would take any country.
            // Replaced rather than added to: NL is the one valid value, so the ISO list has nothing left to check,
            // and keeping it would report a second error on an unknown code.
            'country_code' => ['required', 'string', 'in:NL'],
            // strict: a JSON number only, so "30" or 30.0 is rejected instead of quietly cast.
            'payment_term_days' => ['required', 'integer:strict', 'between:1,365'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'country_code.in' => 'A business must be registered in the Netherlands.',
        ];
    }

    public function toDto(): BusinessData
    {
        $safe = $this->safe();

        return new BusinessData(
            registeredName: $safe->string('registered_name')->toString(),
            kvkNumber: $safe->string('kvk_number')->toString(),
            vatNumber: $safe->string('vat_number')->toString(),
            street: $safe->string('street')->toString(),
            houseNumber: $safe->string('house_number')->toString(),
            houseNumberAddition: $this->validatedStringOrNull('house_number_addition'),
            postalCode: $safe->string('postal_code')->toString(),
            city: $safe->string('city')->toString(),
            countryCode: $safe->string('country_code')->toString(),
            paymentTermDays: $safe->integer('payment_term_days'),
        );
    }

    /**
     * Canonical form before any rule runs, so the rules, including unique, and the stored value see one shape.
     * A field that wasn't sent is merged as null, which its required rule rejects just as it would the missing field.
     */
    protected function prepareForValidation(): void
    {
        $normalisers = [
            'kvk_number' => Normaliser::kvkNumber(...),
            'vat_number' => Normaliser::vatNumber(...),
            'country_code' => Normaliser::uppercase(...),
            // Always the Dutch shape: a business address is Dutch, and any other country is rejected anyway.
            'postal_code' => Normaliser::dutchPostcode(...),
        ];

        foreach ($normalisers as $field => $normalise)
        {
            $this->merge([$field => $normalise($this->input($field))]);
        }
    }

    protected function owner(): User
    {
        $user = $this->user();

        // auth:sanctum runs before any request is resolved, so this only fires if the route loses its middleware.
        if (! $user instanceof User)
        {
            throw new LogicException('A business request needs a logged-in user.');
        }

        return $user;
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
