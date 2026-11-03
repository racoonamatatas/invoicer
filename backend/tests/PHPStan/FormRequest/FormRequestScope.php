<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use Illuminate\Foundation\Http\FormRequest;
use PHPStan\Analyser\Scope;
use PHPStan\Type\Constant\ConstantArrayType;
use PHPStan\Type\Type;

/**
 * What the two collectors share: which class a node belongs to, and which keys a type spells out.
 */
final class FormRequestScope
{
    /**
     * The class the node is in and its parents, nearest first, when that class is a FormRequest; otherwise null.
     *
     * The parents travel with every record because the rule sees only the collected data, not the reflection: it
     * needs them to find the `rules()` a class inherits, and the subclasses that override it.
     *
     * @return list<string>|null
     */
    public static function lineage(Scope $scope): ?array
    {
        $class = $scope->getClassReflection();

        if ($class === null || ! $class->isSubclassOf(FormRequest::class))
        {
            return null;
        }

        return [$class->getName(), ...$class->getParentClassesNames()];
    }

    /**
     * The keys a key argument names: one for `'email'`, several for a union like `'a'|'b'` or a list like
     * `['a', 'b']`. A null in the list means a key that isn't known before the code runs, which the rule reports
     * rather than skips.
     *
     * @return non-empty-list<string|null>
     */
    public static function keysNamedBy(Type $type): array
    {
        $strings = $type->getConstantStrings();

        if ($strings !== [])
        {
            return array_map(static fn ($string): string => $string->getValue(), $strings);
        }

        if (! $type->isConstantArray()->yes())
        {
            return [null];
        }

        $keys = [];

        foreach ($type->getConstantArrays() as $array)
        {
            foreach ($array->getValueTypes() as $valueType)
            {
                array_push($keys, ...self::keysNamedBy($valueType));
            }
        }

        // An empty list names no key at all, so nothing in it can be missing from rules().
        return $keys === [] ? [null] : $keys;
    }

    /**
     * The keys of an array every possible value of which has the same known keys; otherwise null.
     *
     * A union of arrays, from a `rules()` that returns one of two arrays, keeps only the keys both have: a key in one
     * of them is not declared on every request.
     *
     * @return list<string>|null
     */
    public static function arrayKeys(Type $type): ?array
    {
        if (! $type->isConstantArray()->yes())
        {
            return null;
        }

        $keySets = array_map(self::keysOfOneArray(...), $type->getConstantArrays());

        return array_values(array_intersect(...$keySets));
    }

    /**
     * @return list<string>
     */
    private static function keysOfOneArray(ConstantArrayType $array): array
    {
        // (string): an integer key, as in `[0 => …]`, is a key PHP stores as an int, and a read names it as a string.
        return array_map(static fn ($key): string => (string) $key->getValue(), $array->getKeyTypes());
    }
}
