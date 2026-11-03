<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class ArrayKeyArguments extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['a.b' => ['required'], 'c' => ['required']];
    }

    /**
     * @return list<mixed>
     */
    public function toDto(string $field): array
    {
        $safe = $this->safe();

        return [
            $this->validated(['a', 'b']),
            $safe->string(['a', 'b']),
            $safe[['a', 'b']],
            $this->validated([]),
            $this->safe(['a', 'c']),
            $safe->string(['a', 'x']),
            $safe->only(['a', 'x']),
            $safe->collect(['c', 'y']),
            $safe->whenHas(['a', 'b'], static fn (mixed $value): mixed => $value),
            $safe->string(['a', $field]),
        ];
    }
}
