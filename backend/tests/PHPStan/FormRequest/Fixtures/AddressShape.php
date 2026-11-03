<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

final class AddressShape
{
    /**
     * @return array{street: list<string>, city: list<string>}
     */
    public static function rules(): array
    {
        return ['street' => ['required', 'string'], 'city' => ['required', 'string']];
    }

    /**
     * @return array<string, list<string>>
     */
    public static function rulesWithoutShape(): array
    {
        return ['street' => ['required', 'string'], 'city' => ['required', 'string']];
    }
}
