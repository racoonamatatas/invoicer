<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\DataTransferObjects\Input\Invoice\InvoiceData;
use App\DataTransferObjects\Input\Invoice\InvoiceLineData;
use App\Enums\VatOption;
use App\Enums\VatTreatment;
use App\Models\Business;
use App\Models\Client;
use App\Validation\EuMemberStates;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Fluent;
use Illuminate\Validation\ConditionalRules;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use LogicException;

/**
 * Validates a draft invoice with its lines, for both create and update: PUT replaces the whole draft, lines included,
 * so the two take the same fields.
 *
 * The caps keep the largest invoice exact in the frontend, whose numbers are exact only up to 2^53 (about 9.0 × 10^15).
 * A line is at most 10^7 hundredths × 10^8 cents / 100 = 10^13 cents, 100 lines are 10^15, and 21% VAT on top makes
 * 1.21 × 10^15. That is far inside PHP's int too, so the totals' overflow guards are never reached from a request.
 */
final class InvoiceRequest extends FormRequest
{
    private const int MAX_LINES = 100;

    private const int MAX_QUANTITY_HUNDREDTHS = 10_000_000; // 100 000 units

    private const int MAX_UNIT_PRICE_CENTS = 100_000_000; // €1 000 000

    /**
     * Get the validation rules that apply to the request.
     *
     * - client_id and bank_account_id exist within this business only. They are body fields, so another business's
     *   is a 422 on the field rather than a 404.
     * - payment_term_days is present but nullable: null means the business's default, so it has to be sent on purpose.
     * - lines may be empty: a draft is edited freely, and "at least one line" is a rule for sending.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $businessId = $this->business()->id;

        return [
            'client_id' => ['required', 'integer:strict', Rule::exists('clients', 'id')->where('business_id', $businessId)],
            'bank_account_id' => ['required', 'integer:strict', Rule::exists('bank_accounts', 'id')->where('business_id', $businessId)],
            'vat_treatment' => ['required', 'string', Rule::in(self::apiNames(VatTreatment::cases()))],
            'payment_term_days' => ['present', 'nullable', 'integer:strict', 'between:1,365'],
            'lines' => ['present', 'array', 'list', 'max:'.self::MAX_LINES],
            'lines.*' => ['array:description,quantity_hundredths,unit_price_cents,vat_option'],
            'lines.*.description' => ['required', 'string', 'max:255'],
            'lines.*.quantity_hundredths' => ['required', 'integer:strict', 'between:0,'.self::MAX_QUANTITY_HUNDREDTHS],
            'lines.*.unit_price_cents' => ['required', 'integer:strict', 'between:0,'.self::MAX_UNIT_PRICE_CENTS],
            'lines.*.vat_option' => $this->vatOptionRules(),
        ];
    }

    /**
     * Rules that need more than the input: the treatment is checked against the client's country and VAT number.
     *
     * @return list<Closure(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                // Either error already explains the 422, and without a valid client and treatment there is nothing
                // to compare.
                if ($validator->errors()->hasAny(['client_id', 'vat_treatment']))
                {
                    return;
                }

                $client = $this->business()->clients()->findOrFail($this->integer('client_id'));
                $treatment = VatTreatment::tryFromApiName($this->string('vat_treatment')->toString());

                $error = match ($treatment)
                {
                    VatTreatment::ReverseCharge => self::reverseChargeError($client),
                    VatTreatment::OutsideScope => EuMemberStates::contains($client->country_code)
                        ? 'Outside scope needs a client outside the EU.'
                        : null,
                    // Domestic VAT fits any client: an EU consumer is charged Dutch VAT too.
                    VatTreatment::Domestic => null,
                    null => throw new LogicException('vat_treatment passed validation but names no treatment.'),
                };

                if ($error !== null)
                {
                    $validator->errors()->add('vat_treatment', $error);
                }
            },
        ];
    }

    public function toDto(): InvoiceData
    {
        $safe = $this->safe();

        $lines = [];
        foreach ($safe->array('lines') as $line)
        {
            $lines[] = self::lineToDto($line);
        }

        return new InvoiceData(
            clientId: $safe->integer('client_id'),
            bankAccountId: $safe->integer('bank_account_id'),
            vatTreatment: self::treatment($safe->string('vat_treatment')->toString()),
            // Not $safe->integer(): that turns null into 0, and 0 is not "the business default".
            paymentTermDays: $safe->input('payment_term_days') === null ? null : $safe->integer('payment_term_days'),
            lines: $lines,
        );
    }

    /**
     * Required with a known name on a Domestic invoice, prohibited on the others: only a Domestic invoice charges VAT
     * itself. The closure gets the whole input, so it reads the invoice's treatment from inside a line's rule.
     *
     * @return list<ConditionalRules>
     */
    private function vatOptionRules(): array
    {
        $chargesVat = static fn (Fluent $input): bool => $input->get('vat_treatment') === VatTreatment::Domestic->apiName();

        return [Rule::when($chargesVat, ['required', 'string', Rule::in(self::apiNames(VatOption::cases()))], ['prohibited'])];
    }

    /**
     * Reverse charge only applies to a business client in another EU country, which the VAT number proves it is.
     */
    private static function reverseChargeError(Client $client): ?string
    {
        if ($client->country_code === 'NL' || ! EuMemberStates::contains($client->country_code))
        {
            return 'Reverse charge needs a client in an EU country other than the Netherlands.';
        }

        if ($client->vat_number === null)
        {
            return 'Reverse charge needs a client with a VAT number.';
        }

        return null;
    }

    /**
     * The type checks only narrow what the rules have already proven, so a failing one means a bug.
     */
    private static function lineToDto(mixed $line): InvoiceLineData
    {
        if (! is_array($line))
        {
            throw new LogicException('A validated invoice line is not an array.');
        }

        $description = $line['description'] ?? null;
        $quantityHundredths = $line['quantity_hundredths'] ?? null;
        $unitPriceCents = $line['unit_price_cents'] ?? null;
        $vatOption = $line['vat_option'] ?? null;

        if (! is_string($description) || ! is_int($quantityHundredths) || ! is_int($unitPriceCents)
            || ! ($vatOption === null || is_string($vatOption)))
        {
            throw new LogicException('A validated invoice line has a field of the wrong type.');
        }

        return new InvoiceLineData(
            description: $description,
            quantityHundredths: $quantityHundredths,
            unitPriceCents: $unitPriceCents,
            vatOption: $vatOption === null ? null : self::option($vatOption),
        );
    }

    /**
     * Throws rather than returning null: validation has passed, so an unknown name here is a bug.
     */
    private static function treatment(string $apiName): VatTreatment
    {
        return VatTreatment::tryFromApiName($apiName)
            ?? throw new LogicException("vat_treatment \"{$apiName}\" passed validation but names no treatment.");
    }

    private static function option(string $apiName): VatOption
    {
        return VatOption::tryFromApiName($apiName)
            ?? throw new LogicException("vat_option \"{$apiName}\" passed validation but names no option.");
    }

    /**
     * @param  list<VatOption|VatTreatment>  $cases
     * @return list<string>
     */
    private static function apiNames(array $cases): array
    {
        return array_map(static fn (VatOption|VatTreatment $case): string => $case->apiName(), $cases);
    }

    /**
     * The bound {business}. The binding has already proven it belongs to the user before this request is validated.
     */
    private function business(): Business
    {
        $business = $this->route('business');

        if (! $business instanceof Business)
        {
            throw new LogicException('An invoice request needs a bound {business} route parameter.');
        }

        return $business;
    }
}
