<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class UnknownKeys extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string'],
            ...AddressShape::rulesWithoutShape(),
        ];
    }

    public function read(string $field): string
    {
        return $this->safe()->string($field)->toString();
    }
}
