:::lesson{title="Component reference" slug="component-reference" description="Explore all eleven lesson cards, then practice with a short Python exercise." track="Python" level="year 1" mode="lesson" programmingLanguage="Python" tags="[\"reference\"]" presentation="guided" runtimeScope="per-step" schemaVersion=1}
:::

:::step{id="read-and-explore" title="Read and explore"}
:::text{id="variables-overview" visible=true advanced=false}
:::markdown{format="raw"}
## Variables

A **variable** gives a value a name. Use `print()` to display it.

- Choose descriptive names.
- Read code from top to bottom.

| Name | Value |
| --- | --- |
| greeting | Hello |

### Formatting toolkit

Use **bold**, *italic*, ***bold italic***, ~~strikethrough~~, and `inline code`.
Escape punctuation with \*literal asterisks\*.

#### Ordered and nested lists

1. Read the example.
2. Try it yourself.
   - Change the greeting.
   - Predict the output.

##### Progress checklist

- [x] Read the explanation
- [ ] Complete the exercise

###### A helpful reminder

> Names describe values. Choose a name that explains its purpose.
>
> Keep your first example small.

[Python documentation][python-docs] · <https://www.python.org>

[python-docs]: https://docs.python.org/3/tutorial/

A deliberate line break follows here.\
This stays in the same paragraph.

---

```python
message = "Hello, learner!"
print(message)
```

Markdown images use `![Description](https://your-site/image.png)`.
Use the Figure card below for an image with a caption.

Supported: headings 1–6 (use `#` for level 1), paragraphs, emphasis, lists,
checklists, quotes, links, images, tables, code fences, inline code, escapes,
and horizontal rules. Raw HTML, math rendering, Mermaid diagrams, and custom
Markdown extensions are not enabled.
:::
:::

:::task{id="create-a-greeting" visible=true advanced=false}
:::statement{format="raw"}
Create a variable named `greeting`, then display it.
:::
:::context{format="raw"}
You will reuse this variable in the next example.
:::
:::functions
:::function{name="print(value)" format="raw"}
Display a value in the output panel.
:::
:::
:::

:::quick-reference{id="python-essentials" visible=true advanced=false}
:::title{format="raw"}
Python essentials
:::
:::markdown{format="fenced"}
````text
```python
greeting = "Hello"
print(greeting)
```
````
:::
:::

:::worked-example{id="first-greeting-example" visible=true advanced=false runnable=true}
:::title{format="raw"}
A first greeting
:::
:::language{format="raw"}
python
:::
:::code{format="raw"}
greeting = "Hello"
print(greeting)
:::
:::explanation{format="raw"}
The first line assigns a string. The second line displays it.
:::
:::expectedOutput{format="raw"}
Hello
:::
:::

:::figure{id="variable-diagram" visible=true advanced=false}
:::imageUrl{format="raw"}
https://placehold.co/800x450
:::
:::alt{format="raw"}
A placeholder for a diagram showing a value assigned to a name
:::
:::caption{format="raw"}
Replace this placeholder with your own accessible image.
:::
:::markdown{format="raw"}
Use the caption to explain the diagram.
:::
:::

:::mcq{id="assignment-quiz" visible=true advanced=false multiple=false}
:::question{format="raw"}
Which line assigns a value to a variable?
:::
:::choices
:::choice{id="assignment-quiz-assign" correct=true format="raw"}
greeting = "Hello"
:::
:::choice{id="assignment-quiz-print" correct=false format="raw"}
print("Hello")
:::
:::
:::explanation{format="raw"}
The equals sign assigns the string to greeting.
:::
:::
:::

:::step{id="practice-and-reflect" title="Practice and reflect"}
:::code-exercise{id="greeting-exercise" visible=true advanced=false}
:::language{format="raw"}
python
:::
:::starterCode{format="raw"}
greeting = ""
# Display greeting below
:::
:::solution{format="raw"}
greeting = "Hello"
print(greeting)
:::
:::execution{format="raw"}
browser
:::
:::prompt{format="raw"}
Set `greeting` to `"Hello"`, then print it.
:::
:::checkScript{format="raw"}
assert greeting == "Hello", "Set greeting to Hello."
:::
:::expectedOutput{format="raw"}
Hello
:::
:::styleConfig{format="raw"}
Prefer snake_case for variable names.
:::
:::randomisation{format="raw"}
No randomisation for this introductory exercise.
:::
:::reviewPrinciples{format="raw"}
Use a descriptive variable name.
Print the stored value.
:::
:::

:::reflection{id="assignment-reflection" visible=true advanced=false}
:::prompt{format="raw"}
How does assigning a value differ from displaying it?
:::
:::rubric
:::keyIdeas{format="raw"}
Assignment stores a value under a name; print displays a value.
:::
:::misconceptions{format="raw"}
Assignment automatically prints the value.
:::
:::variants{format="raw"}
Accept clear explanations in the learner’s own words.
:::
:::
:::

:::tutor-config{id="greeting-hints" visible=true advanced=false llmAllowed=false copyingAllowed=false}
:::mode{format="raw"}
hint
:::
:::chips{format="raw"}
What does assignment do?
How do I display a variable?
:::
:::constraints{format="raw"}
Ask the learner to explain their current code. Offer one hint at a time. Do not provide the full solution.
:::
:::

:::data-asset{id="practice-data" visible=true advanced=false}
:::url{format="raw"}
https://example.edu/example.csv
:::
:::filename{format="raw"}
example.csv
:::
:::runtimePath{format="raw"}
/data/example.csv
:::
:::description{format="raw"}
Replace this example URL with your own downloadable data. Runtime files are not downloaded automatically.
:::
:::

:::code-review{id="greeting-review" visible=true advanced=false}
:::title{format="raw"}
Greeting review
:::
:::purpose{format="raw"}
Help the learner connect assignment with output.
:::
:::mechanism{format="raw"}
Review the code against the criteria.
:::
:::output{format="raw"}
One strength and one suggestion.
:::
:::keyIdeas{format="raw"}
Correct assignment and output.
:::
:::misconceptions{format="raw"}
Printing the variable name as a literal string.
:::
:::variants{format="raw"}
Single or double quotes are acceptable.
:::
:::
:::
