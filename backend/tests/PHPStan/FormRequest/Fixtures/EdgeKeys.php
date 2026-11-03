<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class EdgeKeys extends FormRequest
{
    /**
     * @return array<int|string, mixed>
     */
    public function rules(): array
    {
        return [0 => ['required'], 'settings' => ['array'], 'meta.*.x' => ['string']];
    }

    /**
     * @return list<mixed>
     */
    public function toDto(): array
    {
        $safe = $this->safe();

        return [
            $safe[0],
            $this->validated(null),
            $safe->string('settings.theme'),
            $safe->string('meta.foo'),
            $safe[1],
        ];
    }
}
