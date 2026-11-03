<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use App\Http\Requests\Concerns\ReadsValidatedInput;
use Illuminate\Foundation\Http\FormRequest;
use stdClass;

final class ReadShapes extends FormRequest
{
    use ReadsValidatedInput {
        validatedStringOrNull as stringOrNull;
    }

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
    public function toDto(OtherRequest|stdClass $union): array
    {
        $safe = $this->safe();
        $safe['written'] = 'a write, not a read';

        return [
            parent::validated('p'),
            self::validated('s'),
            $this->stringOrNull('alias'),
            $this->ValidatedStringOrNull('capitals'),
            $union->validated('u'),
            $safe?->string('n'),
        ];
    }
}
