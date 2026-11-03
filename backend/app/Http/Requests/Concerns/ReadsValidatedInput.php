<?php

declare(strict_types = 1);

namespace App\Http\Requests\Concerns;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Typed reads of validated input that `ValidatedInput` has no method for. The one shared place for them, so the rule
 * that checks which keys a request reads finds every helper here, and takes each one's key from its first parameter.
 *
 * @phpstan-require-extends FormRequest
 */
trait ReadsValidatedInput
{
    /**
     * Not `$safe->string()`: that turns null into "", and "?: null" afterwards would also turn "0" into null.
     *
     * Final, so a subclass can't override it with a different first parameter than the one the rule reads its key from.
     * The class that uses the trait still can, by declaring the method itself: the rule then skips the trait's.
     */
    final protected function validatedStringOrNull(string $key): ?string
    {
        $value = $this->safe()->input($key);

        return is_string($value) ? $value : null;
    }
}
