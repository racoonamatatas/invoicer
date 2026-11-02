<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Override;
use PHPStan\Rules\Rule;
use PHPStan\Testing\RuleTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;

/**
 * A Pest it() can't run these: RuleTestCase leaves getRule() abstract, so the test has to be a class that extends it.
 *
 * @extends RuleTestCase<RequestCastInRateLimiterRule>
 */
final class RequestCastInRateLimiterRuleTest extends RuleTestCase
{
    private const string MESSAGE = 'Rate limiters run before validation, so request input can be any type: read it with input() and check the type instead of calling %s().';

    // The line of the first for() call in AccessorsInClosure.php: lines 1-10 hold the file header and its imports, and
    // lines 11-14 open the class and boot().
    private const int FIRST_ACCESSOR_LINE = 15;

    #[Override]
    public static function getAdditionalConfigFiles(): array
    {
        // Larastan's extension, so the analysis knows Laravel's types, such as what the RateLimiter facade's for() is.
        return [__DIR__.'/../../../vendor/larastan/larastan/extension.neon'];
    }

    #[Test]
    public function should_report_each_typed_accessor_called_in_a_limiter_closure(): void
    {
        // Arrange: one limiter per accessor, one per line from FIRST_ACCESSOR_LINE, in this order. The list is written
        // out rather than read from the collector, so that dropping an accessor there fails this test.
        $accessors = [
            'string', 'str', 'integer', 'float', 'boolean', 'date', 'enum', 'enums', 'array', 'collect', 'clamp', 'fluent',
        ];
        $expectedErrors = array_map(
            static fn (string $accessor, int $index): array => [
                sprintf(self::MESSAGE, $accessor),
                self::FIRST_ACCESSOR_LINE + $index,
            ],
            $accessors,
            array_keys($accessors),
        );

        // Act & Assert: analyse() runs the rule over the fixture and compares the errors it reports with these.
        $this->analyse([__DIR__.'/Fixtures/AccessorsInClosure.php'], $expectedErrors);
    }

    /**
     * @return array<string, array{string, int}>
     */
    public static function receivers(): array
    {
        return [
            // PHPStan also analyses `$request?->string()` as a plain method call, so this guards against reporting it twice.
            'a nullsafe call' => ['NullsafeCall.php', 15],
            'a ?Request receiver' => ['NullableReceiver.php', 15],
            'the Request facade' => ['RequestFacadeCall.php', 16],
            'a capitalised accessor name' => ['CapitalisedAccessor.php', 15],
        ];
    }

    #[Test]
    #[DataProvider('receivers')]
    public function should_report_a_typed_accessor_in_a_limiter_closure_read_through(string $fixture, int $line): void
    {
        // Arrange: the fixture's only limiter calls string() on that line.
        $expectedErrors = [[sprintf(self::MESSAGE, 'string'), $line]];

        // Act & Assert
        $this->analyse([__DIR__.'/Fixtures/'.$fixture], $expectedErrors);
    }

    #[Test]
    public function should_report_a_typed_accessor_in_a_static_helper_the_closure_passes_its_request_to(): void
    {
        // Arrange: the closure calls self::emailKey($request), whose body calls string() on line 20.
        $expectedErrors = [[sprintf(self::MESSAGE, 'string'), 20]];

        // Act & Assert
        $this->analyse([__DIR__.'/Fixtures/StaticHelper.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_a_typed_accessor_in_an_instance_helper_the_closure_passes_its_request_to(): void
    {
        // Arrange: the closure calls $this->emailKey($request), whose body calls string() on line 20.
        $expectedErrors = [[sprintf(self::MESSAGE, 'string'), 20]];

        // Act & Assert
        $this->analyse([__DIR__.'/Fixtures/InstanceHelper.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_a_typed_accessor_in_a_closure_given_to_the_rate_limiter_facade(): void
    {
        // Arrange
        $expectedErrors = [[sprintf(self::MESSAGE, 'string'), 15]];

        // Act & Assert
        $this->analyse([__DIR__.'/Fixtures/FacadeClosure.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_a_typed_accessor_in_a_helper_declared_on_the_parent_class(): void
    {
        // Arrange: ParentHelper's limiter calls self::emailKey($request), which ParentKeys declares and runs string()
        // in on line 13. Both files are analysed, because the rule only reports casts in analysed files.
        $expectedErrors = [[sprintf(self::MESSAGE, 'string'), 13]];

        // Act & Assert
        $this->analyse([__DIR__.'/Fixtures/ParentHelper.php', __DIR__.'/Fixtures/ParentKeys.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_a_typed_accessor_in_a_helper_called_with_different_capitalisation(): void
    {
        // Arrange: the limiter calls self::EmailKey($request); emailKey() calls string() on line 21.
        $expectedErrors = [[sprintf(self::MESSAGE, 'string'), 21]];

        // Act & Assert
        $this->analyse([__DIR__.'/Fixtures/CapitalisedHelper.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_a_typed_accessor_in_a_helper_on_another_class_in_another_file(): void
    {
        // Arrange: the limiter calls $this->keys->key($request) on an EmailKeys, whose key() calls string() on line 13
        // of its own file.
        $expectedErrors = [[sprintf(self::MESSAGE, 'string'), 13]];

        // Act & Assert
        $this->analyse([__DIR__.'/Fixtures/OtherClassHelper.php', __DIR__.'/Fixtures/EmailKeys.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_a_typed_accessor_in_the_helper_of_each_class_of_a_union_typed_receiver(): void
    {
        // Arrange: the limiter calls $keys->key($request) on an EmailKeys|IpKeys. Either could be the one at runtime,
        // and each key() calls string() on line 13 of its file.
        $expectedErrors = [[sprintf(self::MESSAGE, 'string'), 13], [sprintf(self::MESSAGE, 'string'), 13]];

        // Act & Assert
        $this->analyse(
            [__DIR__.'/Fixtures/UnionReceiver.php', __DIR__.'/Fixtures/EmailKeys.php', __DIR__.'/Fixtures/IpKeys.php'],
            $expectedErrors,
        );
    }

    #[Test]
    public function should_report_a_typed_accessor_in_a_limiter_method_passed_as_a_first_class_callable_and_in_its_helper(): void
    {
        // Arrange: loginLimit() (line 29) is passed as $this->loginLimit(...) and hands its Request to deviceKey()
        // (line 39); registerLimit() (line 34) is passed by name as self::registerLimit(...). afterValidation() calls
        // string() on line 24, but nothing passes it to for().
        $expectedErrors = [
            [sprintf(self::MESSAGE, 'string'), 29],
            [sprintf(self::MESSAGE, 'string'), 34],
            [sprintf(self::MESSAGE, 'string'), 39],
        ];

        // Act & Assert
        $this->analyse([__DIR__.'/Fixtures/LimiterMethod.php'], $expectedErrors);
    }

    #[Test]
    public function should_report_nothing_for_input_with_a_type_check_ip_or_a_typed_accessor_no_limiter_calls(): void
    {
        // Arrange: the limiter reads input() and checks it with is_string(), and calls ip(). Another method of the
        // same class calls string(), but no limiter calls that method.
        $expectedErrors = [];

        // Act & Assert
        $this->analyse([__DIR__.'/Fixtures/NoReports.php'], $expectedErrors);
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
        return new RequestCastInRateLimiterRule;
    }

    #[Override]
    protected function getCollectors(): array
    {
        return [new RequestCastCollector, new LimiterHelperCallCollector, new LimiterMethodCollector];
    }
}
