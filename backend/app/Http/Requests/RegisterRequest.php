<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

final class RegisterRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // Only an email: the name and password are set through the link in the mail, so a password never
            // exists before the inbox owner has chosen it. No 'unique:users,email' to prevent enumeration.
            'email' => ['required', 'email', 'max:255'],
        ];
    }

    public function email(): string
    {
        return $this->safe()->string('email')->lower()->toString();
    }
}
