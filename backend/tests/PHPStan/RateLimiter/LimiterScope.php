<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use Illuminate\Cache\RateLimiter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter as RateLimiterFacade;
use PhpParser\Node\Expr\CallLike;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PHPStan\Analyser\Scope;
use PHPStan\Reflection\ExtendedMethodReflection;
use PHPStan\Reflection\MethodReflection;
use PHPStan\Type\ObjectType;
use PHPStan\Type\Type;
use PHPStan\Type\TypeCombinator;

/**
 * Tells whether code runs inside a closure registered with RateLimiter::for().
 */
final class LimiterScope
{
    /**
     * Larastan resolves a facade's static `for()` as a method of the facade class itself, so a closure given to the
     * facade finds the facade on the stack, not the RateLimiter it forwards to.
     */
    private const array LIMITER_CLASSES = [RateLimiter::class, RateLimiterFacade::class];

    /**
     * While PHPStan analyses a call's arguments, it pushes that call onto the scope's function call stack. A closure
     * passed to for() is one of those arguments, so every node inside it finds RateLimiter::for on the stack.
     */
    public static function isInLimiter(Scope $scope): bool
    {
        foreach ($scope->getFunctionCallStack() as $reflection)
        {
            if ($reflection instanceof MethodReflection && self::isLimiterFor($reflection))
            {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether this method is RateLimiter::for(), called on the limiter or on its facade.
     */
    public static function isLimiterFor(MethodReflection $method): bool
    {
        return in_array($method->getDeclaringClass()->getName(), self::LIMITER_CLASSES, true)
            && strtolower($method->getName()) === 'for';
    }

    /**
     * The methods a call can run: one for `self::x()`, one per class for `$object->x()` on a union type, since any of
     * them could be the one at runtime. Empty for a call that names no method, such as a function call or a method name
     * held in a variable.
     *
     * @return list<ExtendedMethodReflection>
     */
    public static function calledMethods(CallLike $node, Scope $scope): array
    {
        if ($node instanceof StaticCall && $node->class instanceof Name && $node->name instanceof Identifier)
        {
            $receiver = new ObjectType($scope->resolveName($node->class));
        }
        elseif ($node instanceof MethodCall && $node->name instanceof Identifier)
        {
            $receiver = $scope->getType($node->var);
        }
        else
        {
            return [];
        }

        $methods = [];

        foreach ($receiver->getObjectClassNames() as $className)
        {
            $method = $scope->getMethodReflection(new ObjectType($className), $node->name->name);

            if ($method !== null)
            {
                $methods[] = $method;
            }
        }

        return $methods;
    }

    /**
     * Whether a value of this type is a Request. A `?Request` counts: when it isn't null, it is one.
     */
    public static function isRequest(Type $type): bool
    {
        return new ObjectType(Request::class)->isSuperTypeOf(TypeCombinator::removeNull($type))->yes();
    }

    /**
     * The key of the method a node sits in, or null outside a class method. Inside a closure this is the method that
     * defines the closure.
     */
    public static function enclosingMethod(Scope $scope): ?string
    {
        $function = $scope->getFunction();

        return $function instanceof MethodReflection ? self::methodKey($function) : null;
    }

    /**
     * 'DeclaringClass::method', the same for a call and for the body it runs, however the call names it.
     *
     * The class is the one that declares the method, not the one the call goes through: `self::emailKey()` in a child
     * class runs the body its parent declares. The method name is lower-cased because PHP's are case-insensitive, so
     * `self::EmailKey()` runs `emailKey()`.
     */
    public static function methodKey(MethodReflection $method): string
    {
        return $method->getDeclaringClass()->getName().'::'.strtolower($method->getName());
    }
}
