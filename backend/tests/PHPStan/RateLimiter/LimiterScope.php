<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use Illuminate\Cache\RateLimiter;
use Illuminate\Support\Facades\RateLimiter as RateLimiterFacade;
use PHPStan\Analyser\Scope;
use PHPStan\Reflection\MethodReflection;

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
                && $reflection->getName() === 'for'
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * The 'Class::method' a node sits in, or null outside a class method. Inside a closure this is the method that
     * defines the closure.
     */
    public static function enclosingMethod(Scope $scope): ?string
    {
        $class = $scope->getClassReflection();
        $function = $scope->getFunction();

        if ($class === null || ! $function instanceof MethodReflection)
        {
            return null;
        }

        return $class->getName().'::'.$function->getName();
    }
}
