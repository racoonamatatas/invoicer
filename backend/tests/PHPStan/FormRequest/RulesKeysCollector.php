<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use PhpParser\Node;
use PhpParser\Node\Stmt\Return_;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;
use PHPStan\Reflection\MethodReflection;

/**
 * Records the keys each `return` in a FormRequest's `rules()` declares.
 *
 * The keys come from the type PHPStan infers for the returned array, not from the source text. So a key spread in from
 * another method (`...AddressRules::forAddress()`) counts, as long as that method's `@return` is an array shape.
 *
 * Each record is [the class and its parents, the keys or null when they can't be known, line].
 *
 * @implements Collector<Return_, array{list<string>, list<string>|null, int}>
 */
final class RulesKeysCollector implements Collector
{
    public function getNodeType(): string
    {
        return Return_::class;
    }

    public function processNode(Node $node, Scope $scope): ?array
    {
        $lineage = FormRequestScope::lineage($scope);
        $method = $scope->getFunction();

        // A `return` in a closure inside rules() returns from the closure, such as a rule's own callback.
        if ($lineage === null
            || ! $method instanceof MethodReflection
            || strtolower($method->getName()) !== 'rules'
            || $scope->isInAnonymousFunction())
        {
            return null;
        }

        $keys = $node->expr === null ? null : FormRequestScope::arrayKeys($scope->getType($node->expr));

        return [$lineage, $keys, $node->getStartLine()];
    }
}
