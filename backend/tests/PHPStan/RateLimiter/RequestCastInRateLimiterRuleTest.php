<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use Illuminate\Foundation\Bootstrap\HandleExceptions;
use Override;
use PHPStan\Rules\Rule;
use PHPStan\Testing\RuleTestCase;
use PHPUnit\Framework\Attributes\Test;

/**
 * A Pest it() can't run these: RuleTestCase leaves getRule() abstract, so the test has to be a class that extends it.
 *
 * @extends RuleTestCase<RequestCastInRateLimiterRule>
 */
final class RequestCastInRateLimiterRuleTest extends RuleTestCase
{
    private const string MESSAGE = 'Rate limiters run before validation, so request input can be any type: read it with input() and check the type instead of calling %s().';

    #[Override]
    public static function getAdditionalConfigFiles(): array
    {
        // Larastan's extension, so the analysis knows Laravel's types, such as what the RateLimiter facade's for() is.
        return [__DIR__.'/../../../vendor/larastan/larastan/extension.neon'];
    }

    #[Test]
    public function should_report_each_of_the_11_typed_accessors_called_in_a_limiter_closure(): void
    {
        // Arrange: one limiter per accessor, on lines 15 to 25 of the fixture, in this order.
        $accessors = ['string', 'str', 'integer', 'float', 'boolean', 'date', 'enum', 'enums', 'array', 'collect', 'clamp'];
        $expectedErrors = array_map(
            static fn (string $accessor, int $index): array => [sprintf(self::MESSAGE, $accessor), 15 + $index],
            $accessors,
            array_keys($accessors),
        );

        // Act & Assert: analyse() runs the rule over the fixture and compares the errors it reports with these.
        $this->analyse([__DIR__.'/Fixtures/AccessorsInClosure.php'], $expectedErrors);
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
        // handlers. PHPUnit marks a test that leaves handlers behind as risky; Laravel's own TestCase removes them so.
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
