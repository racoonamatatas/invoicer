<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use PhpParser\Node;
use PhpParser\Node\Expr\CallLike;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;

/**
 * Records every call that hands a Request to a method, such as `self::emailBucketKey($request)`.
 *
 * A typed accessor in such a helper runs before validation when a limiter is the caller, but PHPStan analyses the
 * helper's body on its own, where nothing says who calls it. Each record is [inside a limiter closure, the calling
 * method's key or null, the called methods' keys]. The calling method matters for a limiter written as a method and
 * passed to for() as `$this->loginLimit(...)`: its helpers count only once LimiterMethodCollector has named it.
 *
 * @implements Collector<CallLike, array{bool, string|null, list<string>}>
 */
final class LimiterHelperCallCollector implements Collector
{
    public function getNodeType(): string
    {
        return CallLike::class;
    }

    public function processNode(Node $node, Scope $scope): ?array
    {
        if ($node->isFirstClassCallable() || ! $this->passesARequest($node, $scope))
        {
            return null;
        }

        $helpers = array_map(LimiterScope::methodKey(...), LimiterScope::calledMethods($node, $scope));

        if ($helpers === [])
        {
            return null;
        }

        return [LimiterScope::isInLimiter($scope), LimiterScope::enclosingMethod($scope), $helpers];
    }

    private function passesARequest(CallLike $node, Scope $scope): bool
    {
        foreach ($node->getArgs() as $arg)
        {
            if (LimiterScope::isRequest($scope->getType($arg->value)))
            {
                return true;
            }
        }

        return false;
    }
}
