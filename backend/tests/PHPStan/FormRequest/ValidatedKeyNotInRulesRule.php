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
 * A read runs in every concrete class that has its code: the reading class itself and each subclass. Each of those is
 * checked against the `rules()` it runs with, its own or an inherited one, so a subclass that overrides `rules()` is
 * checked against its own.
 *
 * Strict where it can't tell: a key that isn't known before the code runs, a `rules()` whose keys PHPStan can't see
 * (an `array<string, …>` spread in, say) that a read is checked against, and a concrete request with no `rules()` at
 * all are each reported.
 *
 * Needs a full run to be complete. A run of a few files, such as an editor's, skips a read whose `rules()` is in a file
 * outside the run, and doesn't see the subclasses outside it.
 *
 * Known limits, where a missing key goes unreported:
 * - a read from a plain array that came out of the validated input: a line from `$safe->array('lines')`,
 *   `$this->validated()['x']` or `$safe->all()['x']`;
 * - a read on a `ValidatedInput` outside a request, which doesn't say which request it came from; inside one, it is
 *   checked against the request the code is in, even for `$other->safe()->string('x')`;
 * - a read on a receiver typed as the base `FormRequest`, which names no `rules()`;
 * - a read of the raw input, such as `$this->integer('x')` in `after()`: that isn't validated input.
 *
 * And where a key is reported that doesn't need to be:
 * - a subclass that overrides both `rules()` and the method that reads is still checked against the parent method's
 *   reads;
 * - a key added with `$safe->merge([...])`, which a read after it sees but `rules()` doesn't declare.
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
        $classes = $this->classes($node);
        $rulesByClass = $this->rulesByClass($node);
        $errors = [];

        // A `rules()` with unknown keys is reported once, and only when a read is checked against it. A class with no
        // `rules()` is reported once too, at its first read.
        $unknownRules = [];
        $withoutRules = [];

        foreach ($node->get(ValidatedKeyReadCollector::class) as $file => $readsInFile)
        {
            foreach ($readsInFile as [$readers, $keys, $how, $line])
            {
                $checkAgainst = [];

                foreach ($this->runners($readers, $classes) as $runner)
                {
                    $rulesIn = $classes[$runner]['rulesIn'];

                    if ($rulesIn === null)
                    {
                        $withoutRules[$runner] ??= $this->error(
                            sprintf('Reads validated input with %s, but %s has no rules() to declare its keys.', $how, $runner),
                            'invoicer.validatedReadWithoutRules',
                            $file,
                            $line,
                        );
                    }
                    elseif (isset($rulesByClass[$rulesIn]))
                    {
                        // Not set: the `rules()` is in a file outside this run, so there is nothing to check against.
                        $checkAgainst[$rulesIn] = $rulesByClass[$rulesIn]['keys'];
                    }
                }

                foreach ($checkAgainst as $rulesIn => $declared)
                {
                    if ($declared === null)
                    {
                        $unknownRules[$rulesIn] = true;

                        continue;
                    }

                    foreach ($keys as $key)
                    {
                        if ($key !== null && ! self::isDeclared($key, $declared))
                        {
                            $errors[] = $this->error(
                                sprintf(
                                    'Reads "%s" with %s, but %s::rules() doesn\'t declare it: validation drops a key without a rule, so the read never sees what was sent.',
                                    $key,
                                    $how,
                                    $rulesIn,
                                ),
                                'invoicer.validatedKeyNotInRules',
                                $file,
                                $line,
                            );
                        }
                    }
                }

                if (in_array(null, $keys, true) && $this->anyAnalysed($readers, $classes))
                {
                    $errors[] = $this->error(
                        sprintf('The key read with %s can\'t be known before it runs, so it can\'t be checked against rules(): pass it as a literal.', $how),
                        'invoicer.validatedKeyUnknown',
                        $file,
                        $line,
                    );
                }
            }
        }

        array_push($errors, ...array_values($withoutRules));

        foreach (array_keys($unknownRules) as $class)
        {
            $errors[] = $this->error(
                sprintf(
                    'The keys %s::rules() returns can\'t be known before it runs, so the keys read from its validated input can\'t be checked: give what it spreads in an array-shape @return.',
                    $class,
                ),
                'invoicer.rulesKeysUnknown',
                $rulesByClass[$class]['file'],
                $rulesByClass[$class]['line'],
            );
        }

        return $errors;
    }

    /**
     * Each analysed request class: its parents, the class whose `rules()` it runs, and whether it is abstract.
     *
     * @return array<string, array{parents: list<string>, rulesIn: string|null, abstract: bool}>
     */
    private function classes(CollectedDataNode $node): array
    {
        $classes = [];

        foreach ($node->get(FormRequestClassCollector::class) as $recordsInFile)
        {
            foreach ($recordsInFile as [$lineage, $rulesIn, $abstract])
            {
                $classes[$lineage[0]] = ['parents' => array_slice($lineage, 1), 'rulesIn' => $rulesIn, 'abstract' => $abstract];
            }
        }

        return $classes;
    }

    /**
     * Each request's `rules()`: the keys every `return` in it declares, and where it is.
     *
     * @return array<string, array{keys: list<string>|null, file: string, line: int}>
     */
    private function rulesByClass(CollectedDataNode $node): array
    {
        $rulesByClass = [];

        foreach ($node->get(RulesKeysCollector::class) as $file => $returnsInFile)
        {
            foreach ($returnsInFile as [$class, $keys, $line])
            {
                $known = $rulesByClass[$class] ?? null;

                if ($known === null)
                {
                    $rulesByClass[$class] = ['keys' => $keys, 'file' => $file, 'line' => $line];

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
     * The concrete classes a read runs in: each reading class unless it is abstract, and each concrete subclass.
     *
     * @param  list<string>  $readers
     * @param  array<string, array{parents: list<string>, rulesIn: string|null, abstract: bool}>  $classes
     * @return list<string>
     */
    private function runners(array $readers, array $classes): array
    {
        $runners = [];

        foreach ($classes as $class => $info)
        {
            if ($info['abstract'])
            {
                continue;
            }

            foreach ($readers as $reader)
            {
                if ($class === $reader || in_array($reader, $info['parents'], true))
                {
                    $runners[] = $class;

                    break;
                }
            }
        }

        return $runners;
    }

    /**
     * @param  list<string>  $readers
     * @param  array<string, array{parents: list<string>, rulesIn: string|null, abstract: bool}>  $classes
     */
    private function anyAnalysed(array $readers, array $classes): bool
    {
        foreach ($readers as $reader)
        {
            if (isset($classes[$reader]))
            {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether validation keeps a key, read the way Laravel's dot notation reads it.
     *
     * - `lines.0.description` is kept by a rule for `lines.*.description`: `*` stands for any one segment.
     * - `meta` is kept by a rule for `meta.*.x` alone: validated input holds every parent of a key with a rule, so the
     *   read sees the array of what passed.
     * - `meta.foo` is kept by a rule for `meta` that has no rules below it: validated() keeps that whole value. With a
     *   rule below it, such as `meta.*.x`, only the children with rules are kept.
     *
     * @param  list<string>  $declared
     */
    private static function isDeclared(string $key, array $declared): bool
    {
        $readSegments = explode('.', $key);

        foreach ($declared as $declaredKey)
        {
            $declaredSegments = explode('.', $declaredKey);
            $isShorter = count($declaredSegments) < count($readSegments);

            if ($isShorter && self::hasChildRules($declaredKey, $declared))
            {
                continue;
            }

            // Segment by segment along the shorter of the two: the one left longer is the other's child.
            foreach (array_slice($readSegments, 0, count($declaredSegments)) as $position => $segment)
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
     * @param  list<string>  $declared
     */
    private static function hasChildRules(string $declaredKey, array $declared): bool
    {
        foreach ($declared as $other)
        {
            if (str_starts_with($other, $declaredKey.'.'))
            {
                return true;
            }
        }

        return false;
    }

    private function error(string $message, string $identifier, string $file, int $line): IdentifierRuleError
    {
        return RuleErrorBuilder::message($message)->identifier($identifier)->file($file)->line($line)->build();
    }
}
