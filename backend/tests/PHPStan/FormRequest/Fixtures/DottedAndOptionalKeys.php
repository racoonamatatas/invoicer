<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class DottedAndOptionalKeys extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $rules = [
            'address' => ['required', 'array'],
            'address.street' => ['required', 'string'],
            'lines.*.description' => ['required', 'string'],
            'meta.*.x' => ['required', 'string'],
        ];

        if ($this->isMethod('POST'))
        {
            $rules['extra'] = ['required', 'string'];
        }

        return $rules;
    }

    /**
     * @return list<mixed>
     */
    public function toDto(): array
    {
        $safe = $this->safe();

        return [
            $safe->string('address.street'),
            $safe->string('lines.0.description'),
            $safe->array('lines'),
            $safe->array('meta'),
            $safe->string('address.city'),
            $safe->string('lines.0.price'),
            $safe->string('extra'),
        ];
    }
}
