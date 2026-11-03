<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class ArgumentShapes extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['name' => ['required', 'string']];
    }

    /**
     * @return list<mixed>
     */
    public function toDto(bool $flag): array
    {
        $safe = $this->safe();

        return [
            $safe->except(['password_confirmation']),
            $safe->only([]),
            $this->safe([]),
            $safe->has('name', 'b'),
            $safe->filled('name', 'c'),
            $safe->missing('name', 'd'),
            $safe->isNotFilled('name', 'e'),
            $safe->string(key: 'f'),
            $safe->string($flag ? 'name' : 'g'),
        ];
    }
}
