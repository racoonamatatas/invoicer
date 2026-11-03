<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

final class InheritsRules extends ParentRequest
{
    public function label(): string
    {
        return $this->safe()->string('label')->toString();
    }
}
