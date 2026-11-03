<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use Illuminate\Foundation\Http\FormRequest;

final class WritesAndCompoundAssigns extends FormRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return ['a' => ['required']];
    }

    public function toDto(): void
    {
        $safe = $this->safe();

        unset($safe['u']);
        unset($safe->v);
        $safe['w'] = 1;
        $safe['x'] ??= 1;
        $safe['y'] .= 'q';
        $safe->z ??= 1;
    }
}
