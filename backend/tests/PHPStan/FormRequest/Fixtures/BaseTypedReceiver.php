<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class BaseTypedReceiver
{
    public function store(FormRequest $request): mixed
    {
        return $request->validated('anything');
    }
}
