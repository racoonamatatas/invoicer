<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use App\Http\Requests\Concerns\ReadsValidatedInput;
use Illuminate\Foundation\Http\FormRequest;

abstract class HelperParent extends FormRequest
{
    use ReadsValidatedInput {
        validatedStringOrNull as stringOrNull;
    }
}
