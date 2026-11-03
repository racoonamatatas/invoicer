<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

final class SomeController
{
    /**
     * @return list<mixed>
     */
    public function store(OtherRequest $request): array
    {
        return [$request->validated('y'), $request->validated('z')];
    }
}
