<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use PhpParser\Node;
use PhpParser\Node\Expr\CallLike;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;
use PHPStan\Type\ObjectType;
use PHPStan\Type\Type;

/**
 * Records the methods a limiter closure hands its Request to, such as `self::emailBucketKey($request)`.
 *
 * A typed accessor in such a helper runs before validation just as much as one in the closure itself, but PHPStan
 * analyses the helper's body on its own, where nothing says a limiter calls it.
 *
 * @implements Collector<CallLike, list<string>>
 */
final class LimiterHelperCallCollector implements Collector
{
    public function getNodeType(): string
    {
        return CallLike::class;
    }

    /**
     * @return list<string>|null
     */
    public function processNode(Node $node, Scope $scope): ?array
    {
        if (! LimiterScope::isInLimiter($scope) || $node->isFirstClassCallable() || ! $this->passesARequest($node, $scope))
        {
            return null;
        }

        $call = $this->receiverAndMethodName($node, $scope);

        if ($call === null)
        {
            return null;
        }

        [$receiver, $methodName] = $call;

        // A receiver of a union type records the method on each of its classes: any of them could be the one at runtime.
        $helpers = [];

        foreach ($receiver->getObjectClassNames() as $className)
        {
            $method = $scope->getMethodReflection(new ObjectType($className), $methodName);

            if ($method !== null)
            {
                $helpers[] = LimiterScope::methodKey($method);
            }
        }

        return $helpers === [] ? null : $helpers;
    }

    /**
     * The type the method is looked up on and the method's name, or null for a call that names no method, such as a
     * function call or a method name held in a variable.
     *
     * @return array{Type, string}|null
     */
    private function receiverAndMethodName(CallLike $node, Scope $scope): ?array
    {
        if ($node instanceof StaticCall && $node->class instanceof Name && $node->name instanceof Identifier)
        {
            return [new ObjectType($scope->resolveName($node->class)), $node->name->name];
        }

        if ($node instanceof MethodCall && $node->name instanceof Identifier)
        {
            return [$scope->getType($node->var), $node->name->name];
        }

        return null;
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
