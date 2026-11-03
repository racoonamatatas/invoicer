<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Override;
use PHPStan\Rules\Rule;
use PHPStan\Testing\RuleTestCase;
use PHPUnit\Framework\Attributes\Test;

/**
 * A Pest it() can't run these: RuleTestCase leaves getRule() abstract, so the test has to be a class that extends it.
 *
 * @extends RuleTestCase<ValidatedKeyNotInRulesRule>
 */
final class ValidatedKeyNotInRulesRuleTest extends RuleTestCase
{
    private const string NOT_IN_RULES = 'Reads "%s" with %s, but %s::rules() doesn\'t declare it: validation drops a key without a rule, so the read never sees what was sent.';

    private const string FIXTURES = __DIR__.'/Fixtures/';

    #[Override]
    public static function getAdditionalConfigFiles(): array
    {
        // Larastan's extension, so the analysis knows what FormRequest::safe() and validated() return.
        return [__DIR__.'/../../../vendor/larastan/larastan/extension.neon'];
    }

    #[Test]
    public function should_report_nothing_when_every_key_read_is_declared_including_keys_spread_from_an_array_shape(): void
    {
        // Arrange: rules() spreads in AddressShape::rules(), whose array-shape @return names street and city, and
        // toDto() reads every key it declares in each way the collector knows, including a call with capitals.
        $expectedErrors = [];

        // Act & Assert
        $this->analyse([self::FIXTURES.'EveryKeyDeclared.php', self::FIXTURES.'AddressShape.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_each_key_read_that_rules_does_not_declare(): void
    {
        // Arrange: rules() declares only name. Each line reads an undeclared key in a different way; only() reads
        // two keys, and name is fine. label() shows a read outside toDto() counts too.
        $class = 'Tests\PHPStan\FormRequest\Fixtures\MissingKeys';
        $expectedErrors = [
            [sprintf(self::NOT_IN_RULES, 'nmae', 'string()', $class), 30],
            [sprintf(self::NOT_IN_RULES, 'street', '[]', $class), 31],
            [sprintf(self::NOT_IN_RULES, 'city', '->property', $class), 32],
            [sprintf(self::NOT_IN_RULES, 'note', 'only()', $class), 33],
            [sprintf(self::NOT_IN_RULES, 'email', 'validated()', $class), 34],
            [sprintf(self::NOT_IN_RULES, 'phone', 'safe()', $class), 35],
            [sprintf(self::NOT_IN_RULES, 'region', 'validatedStringOrNull()', $class), 36],
            [sprintf(self::NOT_IN_RULES, 'label', 'string()', $class), 42],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.'MissingKeys.php'], $expectedErrors);
    }

    #[Test]
    public function should_match_dotted_reads_against_wildcard_and_child_rules_and_ignore_a_key_added_under_an_if(): void
    {
        // Arrange: lines 39-42 read address.street (declared), lines.0.description (lines.*.description), lines and
        // meta (parents of declared keys): no errors. Lines 43-44 read dotted keys no rule matches. extra is declared
        // only on a POST, so on other requests its read gets the default: line 45 is reported too.
        $class = 'Tests\PHPStan\FormRequest\Fixtures\DottedAndOptionalKeys';
        $expectedErrors = [
            [sprintf(self::NOT_IN_RULES, 'address.city', 'string()', $class), 43],
            [sprintf(self::NOT_IN_RULES, 'lines.0.price', 'string()', $class), 44],
            [sprintf(self::NOT_IN_RULES, 'extra', 'string()', $class), 45],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.'DottedAndOptionalKeys.php'], $expectedErrors);
    }

    #[Test]
    public function should_check_every_key_an_argument_names_and_skip_except_and_empty_key_lists(): void
    {
        // Arrange: rules() declares only name. Lines 27-29 read no key: except() leaves one out, and only([]) and
        // safe([]) name none. Lines 30-33 pass two keys to methods that check all their arguments, line 34 names its
        // key by parameter name, and line 35 reads one of two literals: the undeclared one is reported each time.
        $class = 'Tests\PHPStan\FormRequest\Fixtures\ArgumentShapes';
        $expectedErrors = [
            [sprintf(self::NOT_IN_RULES, 'b', 'has()', $class), 30],
            [sprintf(self::NOT_IN_RULES, 'c', 'filled()', $class), 31],
            [sprintf(self::NOT_IN_RULES, 'd', 'missing()', $class), 32],
            [sprintf(self::NOT_IN_RULES, 'e', 'isNotFilled()', $class), 33],
            [sprintf(self::NOT_IN_RULES, 'f', 'string()', $class), 34],
            [sprintf(self::NOT_IN_RULES, 'g', 'string()', $class), 35],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.'ArgumentShapes.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_rules_whose_keys_cannot_be_known_and_a_key_that_is_not_a_literal(): void
    {
        // Arrange: rules() spreads in an array<string, …>, which hides its keys, and read() passes the key in a
        // variable. Both are reported rather than skipped: skipping is how a missing key would slip through.
        $expectedErrors = [
            [
                'The keys Tests\PHPStan\FormRequest\Fixtures\UnknownKeys::rules() returns can\'t be known before it runs, so the keys read from its validated input can\'t be checked: give what it spreads in an array-shape @return.',
                16,
            ],
            [
                'The key read with string() can\'t be known before it runs, so it can\'t be checked against rules(): pass it as a literal.',
                24,
            ],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.'UnknownKeys.php', self::FIXTURES.'AddressShape.php'], $expectedErrors);
    }

    #[Test]
    public function should_check_a_parents_read_against_a_subclass_that_overrides_rules_and_a_subclass_read_against_inherited_rules(): void
    {
        // Arrange: ParentRequest's toDto() reads iban on line 21. OverridesRulesWithoutIban drops iban from rules(), so
        // that read is reported for it. InheritsRules reads label, which the inherited rules() declares: no error.
        $expectedErrors = [
            [
                sprintf(self::NOT_IN_RULES, 'iban', 'string()', 'Tests\PHPStan\FormRequest\Fixtures\OverridesRulesWithoutIban'),
                21,
            ],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.'ParentRequest.php', self::FIXTURES.'ChildRequests.php'], $expectedErrors);
    }

    #[Override]
    protected function tearDown(): void
    {
        // Larastan boots a Laravel app to analyse the fixtures, and that app installs Laravel's error and exception
        // handlers. PHPUnit marks a test that leaves handlers behind as risky, so they are removed here, the same way
        // Laravel's own TestCase removes them.
        HandleExceptions::flushState($this);

        parent::tearDown();
    }

    #[Override]
    protected function getRule(): Rule
    {
        return new ValidatedKeyNotInRulesRule;
    }

    #[Override]
    protected function getCollectors(): array
    {
        return [new RulesKeysCollector, new ValidatedKeyReadCollector, new FormRequestClassCollector];
    }
}
