<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use App\Http\Requests\Concerns\ReadsValidatedInput;
use Illuminate\Foundation\Http\FormRequest;

final class DeclaresOwnHelper extends FormRequest
{
    use ReadsValidatedInput;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['name' => ['required']];
    }

    /**
     * @return list<mixed>
     */
    public function toDto(): array
    {
        return [
            $this->validatedStringOrNull(1, 'name'),
            $this->safe()->string('missing'),
        ];
    }

    // PHP runs this one, not the trait's `final` one: a method the class declares itself wins.
    protected function validatedStringOrNull(int $index, string $key): string
    {
        return $key.$index;
    }
}
