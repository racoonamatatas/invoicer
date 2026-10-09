<?php

declare(strict_types = 1);

namespace App\Http\Requests;

use App\DataTransferObjects\Input\Auth\ChangePasswordData;
use App\Validation\PasswordRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

final class ChangePasswordRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'current_password'],
            'password' => PasswordRules::forNewPassword(),
        ];
    }

    public function toDto(): ChangePasswordData
    {
        return new ChangePasswordData(
            newPassword: $this->safe()->string('password')->toString(),
            currentSessionId: $this->session()->getId()
        );
    }
}
