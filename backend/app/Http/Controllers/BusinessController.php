<?php

declare(strict_types = 1);

namespace App\Http\Controllers;

use App\Http\Resources\BusinessResourceData;
use App\Models\Business;
use App\Models\User;
use Illuminate\Container\Attributes\CurrentUser;
use Illuminate\Http\JsonResponse;

final class BusinessController extends Controller
{
    /**
     * The user's own businesses. The query starts from the user, so another user's business can't appear here.
     */
    public function index(#[CurrentUser] User $user): JsonResponse
    {
        $businesses = $user->businesses()
            ->orderBy('legal_name')
            ->orderBy('id') // two businesses with one name still list in a fixed order
            ->get()
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
