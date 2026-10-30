<?php

declare(strict_types = 1);

namespace App\Http;

use App\Exceptions\Http\IfMatchMalformedException;
use App\Exceptions\Http\IfMatchMissingException;
use Illuminate\Http\Request;

/**
 * The version a client says it last saw, from its If-Match header. A write that changes or removes a versioned row
 * compares this with the row's version inside the write itself, so two saves from the same version can't both win.
 */
final readonly class IfMatch
{
    private function __construct(
        public int $version,
    ) {}

    /**
     * Accepts exactly what withVersion() sends: a strong ETag of the version in quotes, "3". "*" is valid HTTP but means
     * any version, which is the check this header exists for, and a weak W/"3" never names one exact version, so both
     * are refused. A leading zero is refused too: ETags compare byte for byte, so "03" is not the "3" that was sent.
     *
     * @throws IfMatchMissingException when the header isn't sent
     * @throws IfMatchMalformedException when it is anything but one quoted version
     */
    public static function fromRequest(Request $request): self
    {
        // has() rather than a null check: an empty header was sent, just wrongly, so it is malformed, not missing.
        if (! $request->headers->has('If-Match'))
        {
            throw new IfMatchMissingException;
        }

        $header = (string) $request->headers->get('If-Match');

        // \z, not $: $ also matches before a trailing newline.
        if (preg_match('/\A"(0|[1-9][0-9]*)"\z/', $header, $matches) !== 1)
        {
            throw new IfMatchMalformedException;
        }

        // The regex allows any number of digits; filter_var refuses one past PHP_INT_MAX instead of capping it.
        $version = filter_var($matches[1], FILTER_VALIDATE_INT);
        if ($version === false)
        {
            throw new IfMatchMalformedException;
        }

        return new self($version);
    }
}
