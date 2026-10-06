<?php

declare(strict_types = 1);

namespace App\Http\Responses;

use Illuminate\Http\Response;

final class NoContentResponse extends Response
{
    public function __construct()
    {
        parent::__construct('', Response::HTTP_NO_CONTENT);
    }
}
