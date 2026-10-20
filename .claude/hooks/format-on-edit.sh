#!/bin/bash
# PostToolUse hook for Edit|Write: formats the file Claude just changed, the
# way the editor does on save. Pint for PHP, ESLint's fixer for TypeScript
# and Vue (ESLint's stylistic rules are this repo's frontend formatter).
# The hook's JSON is read with Node, falling back to PHP, so a machine with
# only one of the two still formats the files that tool can handle.

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | node -e 'const input = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(input.tool_input?.file_path ?? "");' 2>/dev/null) \
    || FILE_PATH=$(printf '%s' "$INPUT" | php -r '$input = json_decode(stream_get_contents(STDIN), true); echo $input["tool_input"]["file_path"] ?? "";' 2>/dev/null)

case "$FILE_PATH" in
    "$CLAUDE_PROJECT_DIR"/backend/*.php)
        cd "$CLAUDE_PROJECT_DIR/backend" && vendor/bin/pint --quiet "$FILE_PATH"
        ;;
    "$CLAUDE_PROJECT_DIR"/frontend/*.ts | "$CLAUDE_PROJECT_DIR"/frontend/*.vue)
        cd "$CLAUDE_PROJECT_DIR/frontend" && ./node_modules/.bin/eslint --fix "$FILE_PATH"
        ;;
esac

# Formatting is best effort: a lint error the fixer can't fix is for the
# checks to report, not a reason to fail the edit.
exit 0
