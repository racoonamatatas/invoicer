<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Contracts\Validation\Factory;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

final class BuildsOwnValidator extends FormRequest
{
    /**
     * Never called: validator() below replaces the validator built from it.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['a' => ['required']];
    }

    public function validator(Factory $factory): Validator
    {
        return $factory->make($this->all(), ['b' => ['required']]);
    }

    /**
     * @return list<mixed>
     */
    public function toDto(): array
    {
        $safe = $this->safe();

        return [
            $safe->string('a'),
            $safe->string('b'),
        ];
    }
}
