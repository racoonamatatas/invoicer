<?php

declare(strict_types = 1);

namespace Tests\PHPStan\FormRequest;

use PhpParser\Node;
use PHPStan\Analyser\Scope;
use PHPStan\Node\CollectedDataNode;
use PHPStan\Rules\IdentifierRuleError;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;

/**
 * Reports a FormRequest that reads a validated key its `rules()` doesn't declare.
 *
 * Validation drops every key that has no rule, so such a read never sees what the client sent: `$safe->string('x')`
 * quietly returns "", `integer()` 0. A feature test catches that only if it happens to check that field.
 *
 * Which `rules()` a read is checked against: the one its class declares or inherits, and the one of every subclass that
 * overrides it, because a parent's `toDto()` runs with the subclass's rules.
 *
 * Strict where it can't tell: a key that isn't known before the code runs, a `rules()` whose keys PHPStan can't see
 * (an `array<string, …>` spread in, say), and a read in a request with no `rules()` at all are each reported.
 *
 * Known limits, where a missing key goes unreported:
 * - a read from a plain array that came out of the validated input, such as a line from `$safe->array('lines')`;
 * - a read of the raw input, such as `$this->integer('x')` in `after()`: that isn't validated input;
 * - a `rules()` in a file PHPStan doesn't analyse, such as a vendor package's request.
 *
 * @implements Rule<CollectedDataNode>
 */
final class ValidatedKeyNotInRulesRule implements Rule
{
    public function getNodeType(): string
    {
        return CollectedDataNode::class;
    }

    /**
     * @return list<IdentifierRuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        $rulesByClass = $this->rulesByClass($node);
        $errors = [];

        foreach ($rulesByClass as $class => $rules)
        {
            if ($rules['keys'] === null)
            {
                $errors[] = RuleErrorBuilder::message(sprintf(
                    'The keys %s::rules() returns can\'t be known before it runs, so the keys read from its validated input can\'t be checked: give what it spreads in an array-shape @return.',
                    $class,
                ))
                    ->identifier('invoicer.rulesKeysUnknown')
                    ->file($rules['file'])
                    ->line($rules['line'])
                    ->build();
            }
        }

        foreach ($node->get(ValidatedKeyReadCollector::class) as $file => $readsInFile)
        {
            foreach ($readsInFile as [$lineage, $keys, $how, $line])
            {
                foreach ($this->errorsForRead($lineage, $keys, $how, $rulesByClass) as [$message, $identifier])
                {
                    $errors[] = RuleErrorBuilder::message($message)
                        ->identifier($identifier)
                        ->file($file)
                        ->line($line)
                        ->build();
                }
            }
        }

        return $errors;
    }

    /**
     * Each request's `rules()`: its class and parents, the keys every `return` in it declares, and where it is.
     *
     * @return array<string, array{lineage: list<string>, keys: list<string>|null, file: string, line: int}>
     */
    private function rulesByClass(CollectedDataNode $node): array
    {
        $rulesByClass = [];

        foreach ($node->get(RulesKeysCollector::class) as $file => $returnsInFile)
        {
            foreach ($returnsInFile as [$lineage, $keys, $line])
            {
                $class = $lineage[0];
                $known = $rulesByClass[$class] ?? null;

                if ($known === null)
                {
                    $rulesByClass[$class] = ['lineage' => $lineage, 'keys' => $keys, 'file' => $file, 'line' => $line];

                    continue;
                }

                // A key is declared only when every `return` declares it; one `return` with unknown keys makes the
                // whole method unknown.
                $known['keys'] = $known['keys'] === null || $keys === null
                    ? null
                    : array_values(array_intersect($known['keys'], $keys));
                $rulesByClass[$class] = $known;
            }
        }

        return $rulesByClass;
    }

    /**
     * @param  list<string>  $lineage
     * @param  non-empty-list<string|null>  $keys
     * @param  array<string, array{lineage: list<string>, keys: list<string>|null, file: string, line: int}>  $rulesByClass
     * @return list<array{string, string}>
     */
    private function errorsForRead(array $lineage, array $keys, string $how, array $rulesByClass): array
    {
        $applicable = $this->applicableRules($lineage, $rulesByClass);

        if ($applicable === [])
        {
            return [[
                sprintf('%s reads validated input with %s, but no rules() declares its keys.', $lineage[0], $how),
                'invoicer.validatedReadWithoutRules',
            ]];
        }

        $errors = [];

        foreach ($keys as $key)
        {
            if ($key === null)
            {
                $errors[] = [
                    sprintf('The key read with %s can\'t be known before it runs, so it can\'t be checked against rules(): pass it as a literal.', $how),
                    'invoicer.validatedKeyUnknown',
                ];

                continue;
            }

            foreach ($applicable as $class => $declared)
            {
                // null: rules() with unknown keys, which is reported once at rules() itself rather than at every read.
                if ($declared !== null && ! self::isDeclared($key, $declared))
                {
                    $errors[] = [
                        sprintf(
                            'Reads "%s" with %s, but %s::rules() doesn\'t declare it: validation drops a key without a rule, so the read never sees what was sent.',
                            $key,
                            $how,
                            $class,
                        ),
                        'invoicer.validatedKeyNotInRules',
                    ];
                }
            }
        }

        return $errors;
    }

    /**
     * Whether validation keeps a key, read the way Laravel's dot notation reads it.
     *
     * - `lines.0.description` is kept by a rule for `lines.*.description`: `*` stands for any one segment.
     * - `meta` is kept by a rule for `meta.*.x` alone: validated input holds every parent of a key with a rule, so the
     *   read sees the array of what passed.
     *
     * @param  list<string>  $declared
     */
    private static function isDeclared(string $key, array $declared): bool
    {
        $readSegments = explode('.', $key);

        foreach ($declared as $declaredKey)
        {
            $declaredSegments = explode('.', $declaredKey);

            if (count($declaredSegments) < count($readSegments))
            {
                continue;
            }

            // Segment by segment along the read key: a longer declared key leaves the read as its parent.
            foreach ($readSegments as $position => $segment)
            {
                if ($declaredSegments[$position] !== '*' && $declaredSegments[$position] !== $segment)
                {
                    continue 2;
                }
            }

            return true;
        }

        return false;
    }

    /**
     * The `rules()` a read can run with, as class => declared keys: the nearest one up the class's own line, plus that
     * of every subclass that overrides it.
     *
     * @param  list<string>  $lineage
     * @param  array<string, array{lineage: list<string>, keys: list<string>|null, file: string, line: int}>  $rulesByClass
     * @return array<string, list<string>|null>
     */
    private function applicableRules(array $lineage, array $rulesByClass): array
    {
        $applicable = [];

        foreach ($lineage as $class)
        {
            if (isset($rulesByClass[$class]))
            {
                $applicable[$class] = $rulesByClass[$class]['keys'];

                break;
            }
        }

        $readingClass = $lineage[0];

        foreach ($rulesByClass as $class => $rules)
        {
            if ($class !== $readingClass && in_array($readingClass, $rules['lineage'], true))
            {
                $applicable[$class] = $rules['keys'];
            }
        }

        return $applicable;
    }
}
