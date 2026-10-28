<?php

declare(strict_types = 1);

namespace Database\Factories;

use App\Models\BankAccount;
use App\Models\Business;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BankAccount>
 */
class BankAccountFactory extends Factory
{
    /**
     * Counts every account this factory defines, so each gets an IBAN and a label no other one has. Not Faker's
     * unique(): Laravel runs definition() in full on every create(), overrides or not, so a small unique() pool
     * runs out even in a test that passes its own values.
     */
    private static int $sequence = 0;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $number = ++self::$sequence;

        return [
            'business_id' => Business::factory(),
            'iban' => self::dutchIban($number),
            'label' => "Account {$number}",
        ];
    }

    /**
     * A Dutch IBAN in canonical form that passes the Iban rule: bank code TEST, which no real bank has and no test
     * types by hand, and $number as the 10-digit account number. The check digits are computed, not looked up.
     */
    private static function dutchIban(int $number): string
    {
        $bban = 'TEST'.str_pad((string) $number, 10, '0', STR_PAD_LEFT);

        return 'NL'.str_pad((string) (98 - self::mod97($bban.'NL00')), 2, '0', STR_PAD_LEFT).$bban;
    }

    /**
     * ISO 7064 mod-97 of the IBAN's rearranged form, letters as two digits (A = 10 ... Z = 35), in 7-digit pieces
     * so no step outgrows PHP's int. The Iban rule does the same to check; this does it to create.
     */
    private static function mod97(string $rearranged): int
    {
        $digits = '';

        foreach (str_split($rearranged) as $character)
        {
            $digits .= ctype_alpha($character) ? (string) (ord($character) - 55) : $character;
        }

        $remainder = 0;

        foreach (str_split($digits, 7) as $chunk)
        {
            $remainder = (int) ($remainder.$chunk) % 97;
        }

        return $remainder;
    }
}
