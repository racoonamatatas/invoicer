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
    /**
     * Declared here so a resource that uses the trait but forgets "implements JsonSerializable" fails at class
     * load, instead of JsonResponse quietly serialising its public properties and leaking whatever is in them.
     */
    abstract public function jsonSerialize(): mixed;

    public function toResponse($request): JsonResponse
    {
        return new JsonResponse($this);
    }
}
