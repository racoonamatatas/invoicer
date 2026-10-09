<?php

declare(strict_types = 1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Contracts\Support\Responsable;
use Illuminate\Http\JsonResponse;
use JsonSerializable;

/**
 * The user as the frontend sees it. An allowlist: a new column on users stays private until it is added here.
 */
final readonly class UserResourceData implements JsonSerializable, Responsable
{
    public function __construct(
        public int $id,
        public string $name,
        public string $email,
    ) {}

    public static function from(User $user): self
    {
        return new self(
            id: $user->id,
            name: $user->name,
            email: $user->email,
        );
    }

    /**
     * @return array{id: int, name: string, email: string}
     */
    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
        ];
    }

    public function toResponse($request): JsonResponse
    {
        return new JsonResponse($this);
    }
}
