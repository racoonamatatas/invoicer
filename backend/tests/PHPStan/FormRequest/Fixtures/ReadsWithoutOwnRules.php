<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

abstract class ReadsWithoutOwnRules extends FormRequest
{
    public function toDto(): string
    {
        return $this->safe()->string('x')->toString();
    }
}
