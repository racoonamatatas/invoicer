<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

final class AddsToValidator extends FormRequest
{
    public function withValidator(Validator $validator): void
    {
        $validator->sometimes('a', ['required'], static fn (): bool => true);
    }

    public function toDto(): string
    {
        return $this->safe()->string('a')->toString();
    }
}
