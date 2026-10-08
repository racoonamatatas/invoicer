<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\DataTransferObjects\Input\Auth\ResetPasswordData;
use App\Validation\PasswordRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

final class ResetPasswordRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => PasswordRules::forNewPassword(),
        ];
    }

    public function toDto(): ResetPasswordData
    {
        $safe = $this->safe();

        return new ResetPasswordData(
            token: $safe->string('token')->toString(),
            email: $safe->string('email')->lower()->toString(),
            password: $safe->string('password')->toString()
        );
    }
}
