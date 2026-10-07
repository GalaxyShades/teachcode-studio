# Markdown dialect, schema version 1

Use [the complete reference](../content/component-reference.md), which the parser tests load. It contains every lesson component and can be imported with the editor’s **Import Markdown** control. This is a reference for manually authored content, not a YAML migration format.

## Structure

Directives open on a line of their own and close with `:::` on a line of its own. A document contains one optional `lesson` metadata directive and one or more `step` directives. Each step contains component directives. Strings in attributes use JSON quoting and escapes (`\"`, `\\`, `\n`); booleans are `true`/`false`. IDs are stable strings, not necessarily UUIDs. Prefer descriptive names such as `variables-overview`, `greeting-exercise`, and `assignment-quiz-assign`. Keep existing IDs when editing; use new IDs when adding or duplicating items. Duplicate step or card IDs block publication. If IDs are omitted during import, the editor assigns IDs; subsequent serialization retains them.

```text
:::lesson{title="My Python lesson" slug="my-python-lesson" description="Learning outcomes" track="Python" programmingLanguage="Python" tags="[\"intro\"]" schemaVersion=1}
:::

:::step{id="introduction" title="Introduction"}
:::text{id="welcome" visible=true advanced=false}
:::markdown
## Welcome

Write ordinary **Markdown** here.
:::
:::
:::
```

Metadata falls back to the existing lesson when omitted. `track` is `Python`, `R`, or `literacy`. `programmingLanguage` is `Python`, `R`, or an empty string.

## Component fields

Every component accepts `id`, `visible`, and `advanced` attributes. Boolean component fields may be attributes. String fields use named child directives; their body is preserved including whitespace. Ordinary Markdown and code fences are supported inside rich-text fields. Runnable language is `python` or `r`.

| Component       | Fields                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| text            | markdown                                                                                                                      |
| task            | statement, context, functions                                                                                                 |
| quick-reference | title, markdown                                                                                                               |
| worked-example  | title, language, code, explanation, runnable, expectedOutput                                                                  |
| figure          | imageUrl, alt, caption, markdown                                                                                              |
| mcq             | question, multiple, choices, explanation                                                                                      |
| code-exercise   | language, starterCode, solution, execution, instructions, checkScript, expectedOutput, additionalPenalties, ignoredIssues    |
| reflection      | prompt, rubric                                                                                                                |
| data-asset      | url, filename, runtimePath, description                                                                                       |

For compact input, direct component body text is accepted for text/quick-reference/figure Markdown, task statement, reflection prompt, code-exercise instructions, MCQ question, worked-example code, and resource description. Prefer explicit named fields for lossless export.

## Nested directives

- `functions` contains `function{name="print(value)"}` children; each body is its summary.
- `choices` contains `choice{id="option-a" correct=true}` children; each body is its option text. At least two options are required. `multiple=false` requires exactly one correct option for publication.
- `rubric` contains `keyIdeas`, `misconceptions`, and `variants` string fields.
- `advanced` groups valid component fields and marks the card advanced.
- Aliases: `note` → explanation; `automated-check` → checkScript; `expected-output` → expectedOutput; `starter` → starterCode; `system-prompt` → constraints. `solution` is a direct field.
- `additionalPenalties` and `ignoredIssues` on a code exercise are lists: one item per line. `ignoredIssues` lists possible issues in other situations that the teacher does not want flagged for this exercise.

Code fields can contain raw code or a fenced code block. Use an outer fence longer than any internal fence if the field contains literal directive lines. Export handles this automatically. Use named fields instead of embedding JSON payloads.

## Validation and preservation

Unknown components/fields, malformed attributes, unmatched closers, unclosed directives and invalid field types produce line/column diagnostics. Structural errors point at their directive’s opening line. Future schema versions are rejected without silently converting their source. Source remains in the editor and database; the last valid structured model remains active. No raw HTML is rendered.

The serializer emits deterministic field order for a given typed model, stable IDs, explicit visibility/advanced values, code/checks/rubrics and metadata. Round-trip tests compare models for every supported block. Source formatting may be canonicalized on export; semantic field contents and IDs are preserved. Do not store secrets in authored code, URLs or runtime settings.

The canonical exporter uses `format="raw"` on plain string fields and `format="fenced"` when an outer literal fence is needed. These preserve code fences and directive-looking text inside string values. You can omit `format` in hand-written fields; fenced code is unwrapped only for code/starter/solution/check fields.
