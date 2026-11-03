<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class ReadsAnotherRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['own' => ['required', 'string']];
    }

    public function fromOther(OtherRequest $other): mixed
    {
        return $other->validated('own');
    }
}
