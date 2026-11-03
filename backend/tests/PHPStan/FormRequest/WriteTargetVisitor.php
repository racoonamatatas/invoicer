<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use Override;
use PhpParser\Node;
use PhpParser\Node\Expr\AssignOp\Coalesce;
use PhpParser\Node\Stmt\Unset_;
use PhpParser\NodeVisitorAbstract;

/**
 * Marks the two write targets PHPStan's scope gets wrong for the validated-key collector, when the file is parsed.
 *
 * - `unset($safe['x'])` removes a key and reads nothing, but `Scope::isInExpressionAssign()` is false for it.
 * - `$safe['x'] ??= 1` reads the key first, and writes only when it's missing, but `isInExpressionAssign()` is true
 *   for it, as for a plain `=`.
 *
 * Registered with the `phpstan.parser.richParserNodeVisitor` tag, which `RichParser` runs on every file it parses.
 */
final class WriteTargetVisitor extends NodeVisitorAbstract
{
    public const string UNSET_TARGET = 'invoicerUnsetTarget';

    public const string READ_FIRST_TARGET = 'invoicerReadFirstTarget';

    #[Override]
    public function enterNode(Node $node): null
    {
        if ($node instanceof Unset_)
        {
            foreach ($node->vars as $var)
            {
                $var->setAttribute(self::UNSET_TARGET, true);
            }
        }

        if ($node instanceof Coalesce)
        {
            $node->var->setAttribute(self::READ_FIRST_TARGET, true);
        }

        return null;
    }
}
