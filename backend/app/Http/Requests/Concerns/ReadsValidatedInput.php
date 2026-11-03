<?php

declare(strict_types = 1);

namespace App\Http\Requests\Concerns;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Typed reads of validated input that `ValidatedInput` has no method for. The one shared place for them, so a rule
 * that checks which keys `toDto()` reads only has to know these by name.
 *
 * @phpstan-require-extends FormRequest
 */
trait ReadsValidatedInput
{
    /**
     * Not `$safe->string()`: that turns null into "", and "?: null" afterwards would also turn "0" into null.
     */
    protected function validatedStringOrNull(string $key): ?string
    {
        $value = $this->safe()->input($key);

        return is_string($value) ? $value : null;
    }
}
