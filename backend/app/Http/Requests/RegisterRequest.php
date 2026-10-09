<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\DataTransferObjects\Input\Auth\RegisterUserData;
use App\Validation\PasswordRules;
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
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'], // No 'unique:users,email' to prevent enumeration.
            'password' => PasswordRules::forNewPassword(),
        ];
    }

    public function toDto(): RegisterUserData
    {
        $safe = $this->safe();

        return new RegisterUserData(
            name: $safe->string('name')->toString(),
            email: $safe->string('email')->lower()->toString(),
            password: $safe->string('password')->toString()
        );
    }
}
