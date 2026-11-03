<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use Illuminate\Foundation\Http\FormRequest;
use PhpParser\Node;
use PHPStan\Analyser\Scope;
use PHPStan\Collectors\Collector;
use PHPStan\Node\InClassNode;

/**
 * Records each FormRequest class: its name and parents, the class whose `rules()` it runs, and whether it is abstract.
 *
 * The rule needs every class, not only those with a `rules()`: a read in a parent runs in each concrete subclass, and
 * a subclass with no `rules()` at all validates no key. Which class declares `rules()` comes from reflection, so it is
 * known even when that file is outside this run.
 *
 * It also records whether the class has a `validator()`: `FormRequest::getValidatorInstance()` then builds the validator
 * with it instead of from `rules()`, so `rules()` doesn't say which keys are validated.
 *
 * Each record is [the class and its parents, the class that declares its `rules()` or null, abstract, has a
 * `validator()`].
 *
 * @implements Collector<InClassNode, array{list<string>, string|null, bool, bool}>
 */
final class FormRequestClassCollector implements Collector
{
    public function getNodeType(): string
    {
        return InClassNode::class;
    }

    public function processNode(Node $node, Scope $scope): ?array
    {
        $class = $node->getClassReflection();

        if (! $class->isSubclassOf(FormRequest::class))
        {
            return null;
        }

        $rulesIn = $class->hasNativeMethod('rules')
            ? $class->getNativeMethod('rules')->getDeclaringClass()->getName()
            : null;

        return [
            [$class->getName(), ...$class->getParentClassesNames()],
            $rulesIn,
            $class->isAbstract(),
            $class->hasNativeMethod('validator'),
        ];
    }
}
