<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use Illuminate\Support\Facades\Request as RequestFacade;
use PhpParser\Node;
use PhpParser\Node\Expr\CallLike;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;

/**
 * Records every call to a typed accessor on a Request, such as `$request->string('email')`.
 *
 * Each record is [inside a limiter closure, enclosing 'Class::method' or null, accessor name, line]. Whether a record
 * is an error depends on calls elsewhere in the code base, so RequestCastInRateLimiterRule decides once it has them all.
 *
 * @implements Collector<CallLike, array{bool, string|null, string, int}>
 */
final class RequestCastCollector implements Collector
{
    /**
     * Every accessor that turns raw input into a type. Before validation the input can be any type: string(), enum()
     * and date() crash on the wrong one with a 500, and the others quietly coerce it into a made-up value, such as 0
     * from integer() on an array or ['x'] from array() on a string.
     * fluent() wraps the raw input, so its own string() crashes the same way, on a receiver that isn't a Request.
     */
    private const array CAST_METHODS = [
        'string', 'str', 'integer', 'float', 'boolean', 'date', 'enum', 'enums', 'array', 'collect', 'clamp', 'fluent',
    ];

    public function getNodeType(): string
    {
        return CallLike::class;
    }

    public function processNode(Node $node, Scope $scope): ?array
    {
        $accessor = $this->accessorCalledOnARequest($node, $scope);

        if ($accessor === null)
        {
            return null;
        }

        return [
            LimiterScope::isInLimiter($scope),
            LimiterScope::enclosingMethod($scope),
            $accessor,
            $node->getStartLine(),
        ];
    }

    /**
     * The typed accessor's name, lower-cased, when the call reads request input through one; otherwise null.
     *
     * Covers `$request->string()`, `$request?->string()` and the Request facade's `Request::string()`. A nullsafe call
     * needs no case of its own: PHPStan analyses `$request?->string()` as a MethodCall on the non-null `$request` too,
     * so a NullsafeMethodCall case would report it twice.
     */
    private function accessorCalledOnARequest(CallLike $node, Scope $scope): ?string
    {
        if ($node instanceof MethodCall)
        {
            $isOnARequest = LimiterScope::isRequest($scope->getType($node->var));
        }
        elseif ($node instanceof StaticCall && $node->class instanceof Name)
        {
            $isOnARequest = $scope->resolveName($node->class) === RequestFacade::class;
        }
        else
        {
            return null;
        }

        if (! $isOnARequest || ! $node->name instanceof Identifier)
        {
            return null;
        }

        // Lower-cased because PHP method names are case-insensitive: `$request->String()` calls string().
        $name = strtolower($node->name->name);

        return in_array($name, self::CAST_METHODS, true) ? $name : null;
    }
}
