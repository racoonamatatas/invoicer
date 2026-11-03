<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

abstract class ParentRequest extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['iban' => ['required', 'string'], 'label' => ['required', 'string']];
    }

    public function toDto(): string
    {
        return $this->safe()->string('iban')->toString();
    }
}
