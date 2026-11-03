<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class BareReturnInRules extends FormRequest
{
    /**
     * No return type, so a bare `return;` is valid PHP: it returns null, and no key is known.
     *
     * @return array<string, mixed>|null
     */
    public function rules()
    {
        if ($this->isMethod('GET'))
        {
            return;
        }

        return ['name' => ['required', 'string']];
    }

    public function toDto(): string
    {
        return $this->safe()->string('name')->toString();
    }
}
