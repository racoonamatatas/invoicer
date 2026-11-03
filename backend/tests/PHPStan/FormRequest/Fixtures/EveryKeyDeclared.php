<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use App\Http\Requests\Concerns\ReadsValidatedInput;
use Illuminate\Foundation\Http\FormRequest;

final class EveryKeyDeclared extends FormRequest
{
    use ReadsValidatedInput;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string'],
            'note' => ['nullable', 'string'],
            ...AddressShape::rules(),
        ];
    }

    /**
     * @return list<mixed>
     */
    public function toDto(): array
    {
        $safe = $this->safe();

        return [
            $safe->string('name'),
            $safe->String('street'),
            $safe['city'],
            $safe->name,
            $safe->only(['name', 'city']),
            $this->validated('name'),
            $this->validatedStringOrNull('note'),
            $safe->all(),
        ];
    }
}
