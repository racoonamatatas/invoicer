<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class OneUnknownReturn extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        if ($this->isMethod('POST'))
        {
            return ['name' => ['required', 'string']];
        }

        return ['name' => ['required', 'string'], ...AddressShape::rulesWithoutShape()];
    }

    public function toDto(): string
    {
        return $this->safe()->string('name')->toString();
    }
}
