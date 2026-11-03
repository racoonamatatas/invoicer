<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class SeveralReturns extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // A `return` of the closure, not of rules(): counted as one, its string would make every key unknown.
        $message = static function (mixed $value): string {
            return is_string($value) ? 'Too long.' : 'Not a string.';
        };

        if ($this->isMethod('POST'))
        {
            return ['a' => ['required', $message('x')], 'b' => ['required'], 'd' => ['required']];
        }

        // The two arrays differ in a value as well as in d, so PHPStan keeps them as a union of two shapes rather than
        // merging them into one shape with an optional d.
        return $this->isMethod('PUT')
            ? ['a' => ['required'], 'c' => ['required']]
            : ['a' => ['nullable'], 'c' => ['required'], 'd' => ['required']];
    }

    /**
     * @return list<mixed>
     */
    public function toDto(): array
    {
        $safe = $this->safe();

        return [$safe->string('a'), $safe->string('b'), $safe->string('c'), $safe->string('d')];
    }
}
