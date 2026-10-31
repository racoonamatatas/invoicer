<?php

declare(strict_types = 1);

namespace Tests\PHPStan\RateLimiter;

use Illuminate\Http\Request;
use PhpParser\Node;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Identifier;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;
use PHPStan\Type\ObjectType;

/**
 * Records every call to a typed accessor on a Request, such as `$request->string('email')`.
 *
 * Each record is [inside a limiter closure, enclosing 'Class::method' or null, accessor name, line]. Whether a record
 * is an error depends on calls elsewhere in the code base, so RequestCastInRateLimiterRule decides once it has them all.
 *
 * @implements Collector<MethodCall, array{bool, string|null, string, int}>
 */
final class RequestCastCollector implements Collector
{
    /**
     * Every accessor that turns raw input into a type. Before validation the input can be an array: string(), enum()
     * and date() crash on one with a 500, and the others quietly turn it into a made-up value such as 0 or false.
     */
    private const array CAST_METHODS = [
        'string', 'str', 'integer', 'float', 'boolean', 'date', 'enum', 'enums', 'array', 'collect', 'clamp',
    ];

    public function getNodeType(): string
    {
        return MethodCall::class;
    }

    public function processNode(Node $node, Scope $scope): ?array
    {
        if (! $node->name instanceof Identifier || ! in_array($node->name->name, self::CAST_METHODS, true))
        {
            return null;
        }

        if (! new ObjectType(Request::class)->isSuperTypeOf($scope->getType($node->var))->yes())
        {
            return null;
        }

        return [
            LimiterScope::isInLimiter($scope),
            LimiterScope::enclosingMethod($scope),
            $node->name->name,
            $node->getStartLine(),
        ];
    }
}
