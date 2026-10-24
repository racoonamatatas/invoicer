<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Actions\Business\ListBusinessesAction;
use App\Http\Resources\BusinessResourceData;
use App\Models\Business;
use App\Models\User;
use Illuminate\Container\Attributes\CurrentUser;
use Illuminate\Http\JsonResponse;

final class BusinessController extends Controller
{
    /**
     * The user's own businesses. The action's query starts from the user, so another user's business can't appear.
     */
    public function index(#[CurrentUser] User $user, ListBusinessesAction $action): JsonResponse
    {
        $businesses = $action->execute($user)
            ->map(BusinessResourceData::from(...))
            ->all();

        return new JsonResponse($businesses);
    }

    /**
     * The route's ->can('access', 'business') has already proven the business is the user's; the controller only
     * ever reads from the bound model.
     */
    public function show(Business $business): BusinessResourceData
    {
        return BusinessResourceData::from($business);
    }
}
