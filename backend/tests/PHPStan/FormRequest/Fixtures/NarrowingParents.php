<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class NarrowingParents extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'plain' => ['required'],
            'plain.*.x' => ['string'],
            'keyed' => 'required|array:a,b',
            'keyed.*.x' => ['string'],
            'listed' => ['required|array'],
            'listed.*.x' => ['string'],
            'narrowed' => ['required', 'array'],
            'narrowed.*.x' => ['string'],
            'piped' => 'required|list',
            'piped.*.x' => ['string'],
        ];
    }

    /**
     * @return list<mixed>
     */
    public function toDto(): array
    {
        $safe = $this->safe();

        return [
            $safe->string('plain.foo.y'),
            $safe->string('keyed.foo.y'),
            $safe->string('listed.foo.y'),
            $safe->string('narrowed.foo.x'),
            $safe->string('narrowed.foo.y'),
            $safe->string('piped.foo.y'),
        ];
    }
}
