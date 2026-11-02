<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use Illuminate\Cache\RateLimiter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter as RateLimiterFacade;
use PHPStan\Analyser\Scope;
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
            if (
                $reflection instanceof MethodReflection
                && in_array($reflection->getDeclaringClass()->getName(), self::LIMITER_CLASSES, true)
                && strtolower($reflection->getName()) === 'for'
            ) {
                return true;
            }
        }

        return false;
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
