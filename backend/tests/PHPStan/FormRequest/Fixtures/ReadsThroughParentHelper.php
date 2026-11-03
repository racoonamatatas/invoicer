<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

final class ReadsThroughParentHelper extends HelperParent
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['name' => ['required', 'string']];
    }

    /**
     * @return list<string|null>
     */
    public function toDto(): array
    {
        return [
            $this->validatedStringOrNull('name'),
            $this->stringOrNull('missing'),
            $this->validatedStringOrNull('other'),
        ];
    }
}
