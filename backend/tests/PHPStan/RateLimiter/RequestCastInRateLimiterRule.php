<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use PhpParser\Node;
use PHPStan\Analyser\Scope;
use PHPStan\Node\CollectedDataNode;
use PHPStan\Rules\IdentifierRuleError;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * Reports a typed accessor on the Request, like `$request->string('email')`, in code a rate limiter runs.
 *
 * Rate limiters run before validation, so the input can be any type a client sends, arrays included. string() on an
 * array is a 500. Reading it with input() gives `mixed`, and Larastan's max level then forces a type check first.
 *
 * Covered: the limiter, written as a closure or as a method passed to for() as `$this->loginLimit(...)`, and the
 * methods it hands its Request to, by `self::`, `static::`, `$this->` or any object whose class is known.
 *
 * Known limits, where a cast goes unreported:
 * - a helper's helper: it follows one level;
 * - a helper declared on an interface or as an abstract method: its body lives in a class only the runtime knows;
 * - a limiter closure held in a variable, or built with Closure::fromCallable(), before it reaches for();
 * - a helper that is a function, a constructor (`new Key($request)`), or reads `request()` itself.
 *
 * In the other direction, every typed accessor in a helper's body is reported, including one on a different Request or
 * in a closure the helper only defines. Those may be safe, but input() plus a type check is safe as well.
 *
 * @implements Rule<CollectedDataNode>
 */
final class RequestCastInRateLimiterRule implements Rule
{
    public function getNodeType(): string
    {
        return CollectedDataNode::class;
    }

    /**
     * @return list<IdentifierRuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        $limiterMethods = $this->limiterMethods($node);

        // A method's body counts as limiter code when it is a limiter method, or a helper one of those calls.
        $limiterCode = $limiterMethods + $this->helpers($node, $limiterMethods);

        $errors = [];

        foreach ($node->get(RequestCastCollector::class) as $file => $castsInFile)
        {
            foreach ($castsInFile as [$inLimiter, $enclosingMethod, $cast, $line])
            {
                if (! $inLimiter && ($enclosingMethod === null || ! isset($limiterCode[$enclosingMethod])))
                {
                    continue;
                }

                $errors[] = RuleErrorBuilder::message(sprintf(
                    'Rate limiters run before validation, so request input can be any type: read it with input() and check the type instead of calling %s().',
                    $cast,
                ))
                    ->identifier('invoicer.rateLimiterRequestCast')
                    ->file($file)
                    ->line($line)
                    ->build();
            }
        }

        return $errors;
    }

    /**
     * The keys of the methods passed to for() as a first-class callable.
     *
     * @return array<string, true>
     */
    private function limiterMethods(CollectedDataNode $node): array
    {
        $limiterMethods = [];

        foreach ($node->get(LimiterMethodCollector::class) as $recordsInFile)
        {
            foreach ($recordsInFile as $methodsOfOneCall)
            {
                foreach ($methodsOfOneCall as $method)
                {
                    $limiterMethods[$method] = true;
                }
            }
        }

        return $limiterMethods;
    }

    /**
     * The keys of the methods a limiter hands its Request to, from a limiter closure or from a limiter method.
     *
     * @param  array<string, true>  $limiterMethods
     * @return array<string, true>
     */
    private function helpers(CollectedDataNode $node, array $limiterMethods): array
    {
        $helpers = [];

        foreach ($node->get(LimiterHelperCallCollector::class) as $recordsInFile)
        {
            foreach ($recordsInFile as [$inLimiter, $caller, $callees])
            {
                if (! $inLimiter && ($caller === null || ! isset($limiterMethods[$caller])))
                {
                    continue;
                }

                foreach ($callees as $callee)
                {
                    $helpers[$callee] = true;
                }
            }
        }

        return $helpers;
    }
}
