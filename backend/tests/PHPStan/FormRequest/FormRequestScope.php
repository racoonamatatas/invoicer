<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use Illuminate\Foundation\Http\FormRequest;
use PHPStan\Analyser\Scope;
use PHPStan\Type\Constant\ConstantArrayType;
use PHPStan\Type\Type;

/**
 * What the collectors share: which request a node belongs to, and which keys a type spells out.
 */
final class FormRequestScope
{
    /**
     * The name of the class the node is in, when that class is a FormRequest; otherwise null.
     */
    public static function requestClass(Scope $scope): ?string
    {
        $class = $scope->getClassReflection();

        return $class !== null && $class->isSubclassOf(FormRequest::class) ? $class->getName() : null;
    }

    /**
     * The keys a key argument names: one for `'email'` or `0`, several for a union like `'a'|'b'` or a list like
     * `['a', 'b']`, none for `[]` or `null`, which `validated(null)` takes as "the whole input". A null in the list
     * means a key that isn't known before the code runs, which the rule reports rather than skips.
     *
     * @return list<string|null>
     */
    public static function keysNamedBy(Type $type): array
    {
        if ($type->isNull()->yes())
        {
            return [];
        }

        $strings = $type->getConstantStrings();

        if ($strings !== [])
        {
            return array_map(static fn ($string): string => $string->getValue(), $strings);
        }

        if ($type->isInteger()->yes() && $type->getConstantScalarValues() !== [])
        {
            // (string), as rules() keys are: `$safe[0]` reads the key PHP stores as the int 0.
            return array_map(static fn ($int): string => (string) $int, $type->getConstantScalarValues());
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
        return $keys;
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
        $keys = [];

        foreach ($array->getKeyTypes() as $position => $key)
        {
            // An optional key, such as one added under an `if`, is missing from some requests' rules, and a read of
            // it there gets the default instead of what was sent.
            if ($array->isOptionalKey($position))
            {
                continue;
            }

            // (string): an integer key, as in `[0 => …]`, is a key PHP stores as an int, and a read names it as a string.
            $keys[] = (string) $key->getValue();
        }

        return $keys;
    }
}
