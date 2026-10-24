<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use Illuminate\Http\JsonResponse;

/**
 * The Responsable half of a *ResourceData: a controller returns the object itself, and Laravel turns it into a
 * JSON response through its jsonSerialize(). Shared so a change to how resources respond is made once.
 */
trait RespondsWithJson
{
    public function toResponse($request): JsonResponse
    {
        return new JsonResponse($this);
    }
}
