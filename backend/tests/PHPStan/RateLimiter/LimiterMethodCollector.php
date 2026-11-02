<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use PhpParser\Node;
use PhpParser\Node\Expr\CallLike;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;

/**
 * Records the method a limiter is written as, when for() gets it as a first-class callable: `$this->loginLimit(...)`.
 *
 * Nothing inside such a method finds RateLimiter::for on the call stack, because the call only names the method; its
 * body is analysed on its own. So the method's key is recorded here, and the rule treats its body as a limiter's.
 *
 * for() types its callback as a Closure, so a callable array like `[$this, 'loginLimit']` is already a type error.
 *
 * @implements Collector<CallLike, list<string>>
 */
final class LimiterMethodCollector implements Collector
{
    public function getNodeType(): string
    {
        return CallLike::class;
    }

    public function processNode(Node $node, Scope $scope): ?array
    {
        if ($node->isFirstClassCallable() || ! $this->callsLimiterFor($node, $scope))
        {
            return null;
        }

        $callback = $this->callbackArgument($node);

        if (! $callback instanceof CallLike || ! $callback->isFirstClassCallable())
        {
            return null;
        }

        $limiters = array_map(LimiterScope::methodKey(...), LimiterScope::calledMethods($callback, $scope));

        return $limiters === [] ? null : $limiters;
    }

    private function callsLimiterFor(CallLike $node, Scope $scope): bool
    {
        foreach (LimiterScope::calledMethods($node, $scope) as $method)
        {
            if (LimiterScope::isLimiterFor($method))
            {
                return true;
            }
        }

        return false;
    }

    /**
     * for()'s second argument, `$callback`, passed by position or by name.
     */
    private function callbackArgument(CallLike $node): ?Node\Expr
    {
        foreach ($node->getArgs() as $position => $arg)
        {
            if ($arg->name?->name === 'callback' || ($arg->name === null && $position === 1))
            {
                return $arg->value;
            }
        }

        return null;
    }
}
