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
 * Covered: the limiter closure itself, and the methods it hands its Request to. Known limit: it follows one level, so
 * a cast in a helper's helper goes unreported.
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
        $helpers = [];

        foreach ($node->get(LimiterHelperCallCollector::class) as $helpersInFile)
        {
            foreach ($helpersInFile as $helpersOfOneCall)
            {
                foreach ($helpersOfOneCall as $helper)
                {
                    $helpers[$helper] = true;
                }
            }
        }

        $errors = [];

        foreach ($node->get(RequestCastCollector::class) as $file => $castsInFile)
        {
            foreach ($castsInFile as [$inLimiter, $enclosingMethod, $cast, $line])
            {
                if (! $inLimiter && ($enclosingMethod === null || ! isset($helpers[$enclosingMethod])))
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
}
