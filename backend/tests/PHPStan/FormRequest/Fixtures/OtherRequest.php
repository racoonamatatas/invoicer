<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use App\Http\Requests\Concerns\ReadsValidatedInput;
use Illuminate\Foundation\Http\FormRequest;

final class OtherRequest extends FormRequest
{
    use ReadsValidatedInput;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['y' => ['required', 'string']];
    }
}
