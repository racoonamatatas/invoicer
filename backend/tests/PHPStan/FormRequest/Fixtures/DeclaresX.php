<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

final class DeclaresX extends ReadsWithoutOwnRules
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['x' => ['required', 'string']];
    }
}
