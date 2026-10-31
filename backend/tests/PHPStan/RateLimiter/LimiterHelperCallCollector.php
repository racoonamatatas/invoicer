<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use Illuminate\Http\Request;
use PhpParser\Node;
use PhpParser\Node\Expr\CallLike;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;
use PHPStan\Type\ObjectType;

/**
 * Records the methods a limiter closure hands its Request to, such as `self::emailBucketKey($request)`.
 *
 * A typed accessor in such a helper runs before validation just as much as one in the closure itself, but PHPStan
 * analyses the helper's body on its own, where nothing says a limiter calls it.
 *
 * @implements Collector<CallLike, string>
 */
final class LimiterHelperCallCollector implements Collector
{
    public function getNodeType(): string
    {
        return CallLike::class;
    }

    public function processNode(Node $node, Scope $scope): ?string
    {
        if (! LimiterScope::isInLimiter($scope) || $node->isFirstClassCallable() || ! $this->passesARequest($node, $scope))
        {
            return null;
        }

        if ($node instanceof StaticCall && $node->class instanceof Name && $node->name instanceof Identifier)
        {
            return $scope->resolveName($node->class).'::'.$node->name->name;
        }

        if ($node instanceof MethodCall && $node->name instanceof Identifier)
        {
            // An object of a union type could be either class; a nonexistent 'Class::method' never matches a cast.
            $classNames = $scope->getType($node->var)->getObjectClassNames();

            return count($classNames) === 1 ? $classNames[0].'::'.$node->name->name : null;
        }

        return null;
    }

    private function passesARequest(CallLike $node, Scope $scope): bool
    {
        $request = new ObjectType(Request::class);

        foreach ($node->getArgs() as $arg)
        {
            if ($request->isSuperTypeOf($scope->getType($arg->value))->yes())
            {
                return true;
            }
        }

        return false;
    }
}
