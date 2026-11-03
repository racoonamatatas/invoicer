<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class NullableKeys extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['a' => ['required']];
    }

    /**
     * @return list<mixed>
     */
    public function toDto(bool $isPost): array
    {
        $safe = $this->safe();

        return [
            $safe->string($isPost ? 'a' : null),
            $safe->string($isPost ? 'b' : null),
        ];
    }
}
