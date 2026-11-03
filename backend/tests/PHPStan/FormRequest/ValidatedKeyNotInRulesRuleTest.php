<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Override;
use PHPStan\Rules\Rule;
use PHPStan\Testing\RuleTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
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

    // The line of the first read in AccessorMethods.php: one read per line from there.
    private const int FIRST_ACCESSOR_LINE = 29;

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
        $this->analyse(
            [self::FIXTURES.'ParentRequest.php', self::FIXTURES.'InheritsRules.php', self::FIXTURES.'OverridesRulesWithoutIban.php'],
            $expectedErrors,
        );
    }

    #[Test]
    public function should_report_a_parents_read_for_a_concrete_subclass_with_no_rules(): void
    {
        // Arrange: the abstract parent has no rules() and reads x on lines 13 and 18. DeclaresX declares it;
        // DeclaresNothing runs both reads with nothing validated, and is reported once, at the first.
        $expectedErrors = [
            [
                'Reads validated input with string(), but Tests\PHPStan\FormRequest\Fixtures\DeclaresNothing has no rules() to declare its keys.',
                13,
            ],
        ];

        // Act & Assert
        $this->analyse(
            [self::FIXTURES.'ReadsWithoutOwnRules.php', self::FIXTURES.'DeclaresX.php', self::FIXTURES.'DeclaresNothing.php'],
            $expectedErrors,
        );
    }

    #[Test]
    public function should_count_a_key_as_declared_only_when_every_return_of_rules_declares_it(): void
    {
        // Arrange: one `return` declares a, b and d, the other a ternary of two arrays with a and c, and a, c and d.
        // Only a is in all three, so b, c and d, all read on line 40, are reported. The `return` in the closure inside
        // rules() returns from the closure: counted as a `return` of rules(), it would make every key unknown.
        $class = 'Tests\PHPStan\FormRequest\Fixtures\SeveralReturns';
        $expectedErrors = [
            [sprintf(self::NOT_IN_RULES, 'b', 'string()', $class), 40],
            [sprintf(self::NOT_IN_RULES, 'c', 'string()', $class), 40],
            [sprintf(self::NOT_IN_RULES, 'd', 'string()', $class), 40],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.'SeveralReturns.php'], $expectedErrors);
    }

    #[Test]
    public function should_check_a_read_on_another_request_against_that_requests_rules_also_outside_a_request(): void
    {
        // Arrange: OtherRequest declares only y. ReadsAnotherRequest declares own but reads it from an OtherRequest on
        // line 21. SomeController reads z and, through the trait helper written with capitals, w on its line 14.
        $other = 'Tests\PHPStan\FormRequest\Fixtures\OtherRequest';
        $expectedErrors = [
            [sprintf(self::NOT_IN_RULES, 'own', 'validated()', $other), 21],
            [sprintf(self::NOT_IN_RULES, 'z', 'validated()', $other), 14],
            [sprintf(self::NOT_IN_RULES, 'w', 'ValidatedStringOrNull()', $other), 14],
        ];

        // Act & Assert
        $this->analyse(
            [self::FIXTURES.'OtherRequest.php', self::FIXTURES.'ReadsAnotherRequest.php', self::FIXTURES.'SomeController.php'],
            $expectedErrors,
        );
    }

    #[Test]
    public function should_report_nothing_for_reads_whose_rules_is_in_a_file_outside_the_run(): void
    {
        // Arrange: only the subclasses are analysed, as an editor run would. InheritsRules reads label with
        // ParentRequest's rules(), which this run doesn't see, so there is nothing to check it against.
        $expectedErrors = [];

        // Act & Assert
        $this->analyse([self::FIXTURES.'InheritsRules.php', self::FIXTURES.'OverridesRulesWithoutIban.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_nothing_for_rules_with_unknown_keys_that_no_read_is_checked_against(): void
    {
        // Arrange: rules() spreads in an array<string, …>, but the request reads no key, so nothing goes unchecked.
        $expectedErrors = [];

        // Act & Assert
        $this->analyse([self::FIXTURES.'UnknownRulesWithoutReads.php', self::FIXTURES.'AddressShape.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_an_undeclared_key_read_with_each_accessor_the_collector_knows(): void
    {
        // Arrange: one read of the undeclared key k per line from FIRST_ACCESSOR_LINE, in this order. The list is
        // written out rather than read from the collector, so that dropping a method there fails this test.
        $methods = [
            'input', 'file', 'exists', 'whenHas', 'whenFilled', 'whenEnum', 'whenMissing', 'str', 'string', 'boolean',
            'integer', 'float', 'clamp', 'date', 'interval', 'enum', 'enums', 'array', 'collect',
            'all', 'has', 'hasAny', 'filled', 'isNotFilled', 'anyFilled', 'missing', 'only',
        ];
        $class = 'Tests\PHPStan\FormRequest\Fixtures\AccessorMethods';
        $expectedErrors = array_map(
            static fn (string $method, int $index): array => [
                sprintf(self::NOT_IN_RULES, 'k', $method.'()', $class),
                self::FIRST_ACCESSOR_LINE + $index,
            ],
            $methods,
            array_keys($methods),
        );

        // Act & Assert
        $this->analyse([self::FIXTURES.'AccessorMethods.php'], $expectedErrors);
    }

    #[Test]
    public function should_read_int_and_null_keys_and_let_an_array_rule_without_child_rules_cover_its_children(): void
    {
        // Arrange: rules() declares the int key 0, settings as an array with no rules below it, and meta.*.x. Line 27
        // reads 0 and line 28 validated(null), the whole input. settings.theme on line 29 is kept with the whole of
        // settings, and meta.foo on line 30 holds x. Only $safe[1] on line 31 names an undeclared key.
        $expectedErrors = [
            [sprintf(self::NOT_IN_RULES, '1', '[]', 'Tests\PHPStan\FormRequest\Fixtures\EdgeKeys'), 31],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.'EdgeKeys.php'], $expectedErrors);
    }

    #[Test]
    public function should_narrow_a_parent_to_its_child_rules_only_when_its_rules_hold_a_bare_array_or_list(): void
    {
        // Arrange: each parent has a child rule for *.x, and each read below it is of foo.y, which has no rule.
        // Guards third-party code: Laravel's Validator::validated() drops such a child only when the parent's rules
        // hold the whole token array or list, so lines 38-40 keep it: no rule names array, array:a,b compares as a
        // different token, and a list item isn't split on |. Line 41 reads the child with a rule. Lines 42-43 read
        // under a bare array and a piped list, where validated() drops foo.y.
        $class = 'Tests\PHPStan\FormRequest\Fixtures\NarrowingParents';
        $expectedErrors = [
            [sprintf(self::NOT_IN_RULES, 'narrowed.foo.y', 'string()', $class), 42],
            [sprintf(self::NOT_IN_RULES, 'piped.foo.y', 'string()', $class), 43],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.'NarrowingParents.php'], $expectedErrors);
    }

    /**
     * @return array<string, array{string, int}>
     */
    public static function rulesWithAnUnknownReturn(): array
    {
        return [
            'a bare return;, which returns null' => ['BareReturnInRules', 20],
            'one return with known keys and one with a spread array<string, …>' => ['OneUnknownReturn', 18],
        ];
    }

    #[Test]
    #[DataProvider('rulesWithAnUnknownReturn')]
    public function should_report_rules_as_unknown_when_one_of_its_returns_is_unknown(string $class, int $line): void
    {
        // Arrange: the request reads name, which the known return declares. One unknown return is enough to make the
        // keys of rules() unknown, reported at its first return.
        $expectedErrors = [
            [
                sprintf(
                    'The keys Tests\PHPStan\FormRequest\Fixtures\%s::rules() returns can\'t be known before it runs, so the keys read from its validated input can\'t be checked: give what it spreads in an array-shape @return.',
                    $class,
                ),
                $line,
            ],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.$class.'.php', self::FIXTURES.'AddressShape.php'], $expectedErrors);
    }

    #[Test]
    public function should_read_static_calls_aliased_helpers_union_receivers_and_nullsafe_calls_but_not_writes(): void
    {
        // Arrange: rules() declares only name. Line 31 writes a key, which reads nothing. Lines 34-38 read p through
        // parent::, s through self::, alias through the trait helper under an alias, u on an OtherRequest|stdClass
        // (checked against OtherRequest), and n through a nullsafe call.
        $class = 'Tests\PHPStan\FormRequest\Fixtures\ReadShapes';
        $expectedErrors = [
            [sprintf(self::NOT_IN_RULES, 'p', 'parent::validated()', $class), 34],
            [sprintf(self::NOT_IN_RULES, 's', 'self::validated()', $class), 35],
            [sprintf(self::NOT_IN_RULES, 'alias', 'stringOrNull()', $class), 36],
            [sprintf(self::NOT_IN_RULES, 'u', 'validated()', 'Tests\PHPStan\FormRequest\Fixtures\OtherRequest'), 37],
            [sprintf(self::NOT_IN_RULES, 'n', 'string()', $class), 38],
        ];

        // Act & Assert
        $this->analyse([self::FIXTURES.'ReadShapes.php', self::FIXTURES.'OtherRequest.php'], $expectedErrors);
    }

    #[Test]
    public function should_skip_a_read_on_a_receiver_typed_as_the_base_form_request(): void
    {
        // Arrange: the base FormRequest names no rules(). Checked against every analysed request instead, the read of
        // anything would be reported for DeclaresX, which doesn't declare it.
        $expectedErrors = [];

        // Act & Assert
        $this->analyse(
            [self::FIXTURES.'BaseTypedReceiver.php', self::FIXTURES.'DeclaresX.php', self::FIXTURES.'ReadsWithoutOwnRules.php'],
            $expectedErrors,
        );
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
