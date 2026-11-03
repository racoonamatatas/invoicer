<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use PhpParser\Node;
use PhpParser\Node\Stmt\Return_;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;
use PHPStan\Reflection\MethodReflection;
use PHPStan\Type\Type;

/**
 * Records the keys each `return` in a FormRequest's `rules()` declares.
 *
 * The keys come from the type PHPStan infers for the returned array, not from the source text. So a key spread in from
 * another method (`...AddressRules::forAddress()`) counts, as long as that method's `@return` is an array shape.
 *
 * It also records the keys whose rules narrow: a bare `array` or `list` rule. `Validator::validated()` keeps only the
 * children with rules under such a key, when it has any; under any other key it keeps the whole value.
 *
 * Each record is [the class, the keys or null when they can't be known, the narrowing keys, line].
 *
 * @implements Collector<Return_, array{string, list<string>|null, list<string>, int}>
 */
final class RulesKeysCollector implements Collector
{
    public function getNodeType(): string
    {
        return Return_::class;
    }

    public function processNode(Node $node, Scope $scope): ?array
    {
        $class = FormRequestScope::requestClass($scope);
        $method = $scope->getFunction();

        // A `return` in a closure inside rules() returns from the closure, such as a rule's own callback.
        if ($class === null
            || ! $method instanceof MethodReflection
            || strtolower($method->getName()) !== 'rules'
            || $scope->isInAnonymousFunction())
        {
            return null;
        }

        if ($node->expr === null)
        {
            return [$class, null, [], $node->getStartLine()];
        }

        $rules = $scope->getType($node->expr);

        return [$class, FormRequestScope::arrayKeys($rules), self::narrowingKeys($rules), $node->getStartLine()];
    }

    /**
     * @return list<string>
     */
    private static function narrowingKeys(Type $rules): array
    {
        $narrowing = [];

        foreach ($rules->getConstantArrays() as $array)
        {
            $valueTypes = $array->getValueTypes();

            foreach ($array->getKeyTypes() as $position => $key)
            {
                if (self::mayNarrow($valueTypes[$position]))
                {
                    $narrowing[] = (string) $key->getValue();
                }
            }
        }

        return array_values(array_unique($narrowing));
    }

    /**
     * Whether a key's rules may hold the exact token `array` or `list`, the check `validated()` makes with `in_array()`.
     *
     * Strict where it can't tell, because narrowing reports more reads: a string PHPStan can't see, or anything that
     * isn't a string in a rule list, counts. `Rule::array()` is an object that becomes the string "array".
     */
    private static function mayNarrow(Type $keyRules): bool
    {
        // A string is split on `|`. A list's items are not: `['required|array']` is one rule named "required|array".
        if ($keyRules->isString()->yes())
        {
            return self::holdsArrayToken($keyRules, splitOnPipe: true);
        }

        if (! $keyRules->isConstantArray()->yes())
        {
            return true;
        }

        foreach ($keyRules->getConstantArrays() as $list)
        {
            foreach ($list->getValueTypes() as $rule)
            {
                if (! $rule->isString()->yes() || self::holdsArrayToken($rule, splitOnPipe: false))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static function holdsArrayToken(Type $rule, bool $splitOnPipe): bool
    {
        $strings = $rule->getConstantStrings();

        if ($strings === [])
        {
            return true;
        }

        foreach ($strings as $string)
        {
            $tokens = $splitOnPipe ? explode('|', $string->getValue()) : [$string->getValue()];

            // `array:a,b` doesn't count: validated() compares whole tokens, so it keeps that key's whole value.
            if (in_array('array', $tokens, true) || in_array('list', $tokens, true))
            {
                return true;
            }
        }

        return false;
    }
}
