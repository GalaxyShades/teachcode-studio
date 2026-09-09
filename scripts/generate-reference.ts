import { readFile, writeFile } from "node:fs/promises";
import { parseLessonMarkdown, serializeLessonMarkdown } from "../lib/markdown";
import type { LessonDraft } from "../lib/content";
async function main() {
  const source = await readFile("content/component-reference.md", "utf8"),
    draft = parseLessonMarkdown(source, {} as LessonDraft).draft!;
  for (const s of draft.steps)
    for (const b of s.blocks) {
      switch (b.type) {
        case "text":
          b.markdown =
            "## Variables\n\nA **variable** gives a value a name. Use `print()` to display it.\n\n- Choose descriptive names.\n- Read code from top to bottom.\n\n| Name | Value |\n| --- | --- |\n| greeting | Hello |";
          break;
        case "task":
          b.statement = "Create a variable named `greeting`, then display it.";
          b.context = "You will reuse this variable in the next example.";
          b.functions = [
            {
              name: "print(value)",
              summary: "Display a value in the output panel.",
            },
          ];
          break;
        case "quick-reference":
          b.title = "Python essentials";
          b.markdown = '```python\ngreeting = "Hello"\nprint(greeting)\n```';
          break;
        case "worked-example":
          b.title = "A first greeting";
          b.code = 'greeting = "Hello"\nprint(greeting)';
          b.explanation =
            "The first line assigns a string. The second line displays it.";
          b.runnable = true;
          b.expectedOutput = "Hello";
          break;
        case "figure":
          b.alt =
            "A placeholder for a diagram showing a value assigned to a name";
          b.caption =
            "Replace this placeholder with your own accessible image.";
          b.markdown = "Use the caption to explain the diagram.";
          break;
        case "mcq":
          b.question = "Which line assigns a value to a variable?";
          b.choices[0].text = 'greeting = "Hello"';
          b.choices[1].text = 'print("Hello")';
          b.explanation = "The equals sign assigns the string to greeting.";
          break;
        case "code-exercise":
          b.starterCode = 'greeting = ""\n# Display greeting below';
          b.prompt = 'Set `greeting` to `"Hello"`, then print it.';
          b.solution = 'greeting = "Hello"\nprint(greeting)';
          b.checkScript =
            'assert greeting == "Hello", "Set greeting to Hello."';
          b.reviewPrinciples =
            "Use a descriptive variable name.\nPrint the stored value.";
          b.styleConfig = "Prefer snake_case for variable names.";
          b.randomisation = "No randomisation for this introductory exercise.";
          b.expectedOutput = "Hello";
          break;
        case "reflection":
          b.prompt = "How does assigning a value differ from displaying it?";
          b.rubric = {
            keyIdeas:
              "Assignment stores a value under a name; print displays a value.",
            misconceptions: "Assignment automatically prints the value.",
            variants: "Accept clear explanations in the learner’s own words.",
          };
          break;
        case "tutor-config":
          b.mode = "hint";
          b.chips = "What does assignment do?\nHow do I display a variable?";
          b.constraints =
            "Ask the learner to explain their current code. Offer one hint at a time. Do not provide the full solution.";
          break;
        case "data-asset":
          b.filename = "example.csv";
          b.url = "https://example.edu/example.csv";
          b.runtimePath = "/data/example.csv";
          b.description =
            "Replace this example URL with your own downloadable data. Runtime files are not downloaded automatically.";
          break;
        case "code-review":
          b.title = "Greeting review";
          b.purpose = "Help the learner connect assignment with output.";
          b.mechanism = "Review the code against the criteria.";
          b.output = "One strength and one suggestion.";
          b.keyIdeas = "Correct assignment and output.";
          b.misconceptions = "Printing the variable name as a literal string.";
          b.variants = "Single or double quotes are acceptable.";
          break;
      }
    }
  await writeFile(
    "content/component-reference.md",
    serializeLessonMarkdown(draft),
  );
}
main();
