<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use App\Http\Requests\Concerns\ReadsValidatedInput;
use Illuminate\Foundation\Http\FormRequest;

final class MissingKeys extends FormRequest
{
    use ReadsValidatedInput;

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['name' => ['required', 'string']];
    }

    /**
     * @return list<mixed>
     */
    public function toDto(): array
    {
        $safe = $this->safe();

        return [
            $safe->string('nmae'),
            $safe['street'],
            $safe->city,
            $safe->only('name', 'note'),
            $this->validated('email'),
            $this->safe(['phone']),
            $this->validatedStringOrNull('region'),
        ];
    }

    public function label(): string
    {
        return $this->safe()->string('label')->toString();
    }
}
