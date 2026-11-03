<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest\Fixtures;

use App\Enums\InvoiceStatus;
use Illuminate\Foundation\Http\FormRequest;

final class AccessorMethods extends FormRequest
{
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
        $noop = static fn (): null => null;

        return [
            $safe->input('k'),
            $safe->file('k'),
            $safe->exists('k'),
            $safe->whenHas('k', $noop),
            $safe->whenFilled('k', $noop),
            $safe->whenEnum('k', InvoiceStatus::class, $noop),
            $safe->whenMissing('k', $noop),
            $safe->str('k'),
            $safe->string('k'),
            $safe->boolean('k'),
            $safe->integer('k'),
            $safe->float('k'),
            $safe->clamp('k', 0, 1),
            $safe->date('k'),
            $safe->interval('k'),
            $safe->enum('k', InvoiceStatus::class),
            $safe->enums('k', InvoiceStatus::class),
            $safe->array('k'),
            $safe->collect('k'),
            $safe->all(['k']),
            $safe->has('k'),
            $safe->hasAny(['k']),
            $safe->filled('k'),
            $safe->isNotFilled('k'),
            $safe->anyFilled(['k']),
            $safe->missing('k'),
            $safe->only(['k']),
        ];
    }
}
