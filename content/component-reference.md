:::lesson{title="Component reference" slug="component-reference" description="A reference lesson demonstrating all supported card types. Replace it with your authored lesson." track="Python" level="year 1" mode="lesson" programmingLanguage="Python" tags="[\"reference\"]" presentation="guided" runtimeScope="per-step" schemaVersion=1}
:::

:::step{id="b0ec6715-3589-48d0-9e3a-6b6ac8c84671" title="Read and explore"}
:::text{id="141a65f6-d8ee-4b0f-8806-a66b1276cf5b" visible=true advanced=false}
:::markdown{format="raw"}
## Variables

A **variable** gives a value a name. Use `print()` to display it.

- Choose descriptive names.
- Read code from top to bottom.

| Name | Value |
| --- | --- |
| greeting | Hello |
:::
:::

:::task{id="5e6375b2-1d7e-4da5-9728-4d6961430a66" visible=true advanced=false}
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

:::quick-reference{id="cbd64c47-eb1c-4127-97a6-bbd9646bf18b" visible=true advanced=false}
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

:::worked-example{id="2d3fd187-6ecb-4814-a7e5-0590db5b1682" visible=true advanced=false runnable=true}
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

:::figure{id="7c2f6a21-e5d0-4df1-a6ee-01db3b2570e1" visible=true advanced=false}
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

:::mcq{id="bde5a538-3a8b-4909-a2f7-d7481a1d54ae" visible=true advanced=false multiple=false}
:::question{format="raw"}
Which line assigns a value to a variable?
:::
:::choices
:::choice{id="ea50642c-bec4-4198-aa89-f7c6661b65da" correct=true format="raw"}
greeting = "Hello"
:::
:::choice{id="1f18a4ec-879a-4884-8a43-f68dcfa60fea" correct=false format="raw"}
print("Hello")
:::
:::
:::explanation{format="raw"}
The equals sign assigns the string to greeting.
:::
:::
:::

:::step{id="56d8281b-cbe2-4975-9094-1cff1d9859f9" title="Practice and reflect"}
:::code-exercise{id="efd512e1-d2f5-4839-8ded-d67861a77d4c" visible=true advanced=false}
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

:::reflection{id="12b0e08b-6f36-4c6d-9004-c59bc1088b88" visible=true advanced=false}
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

:::tutor-config{id="b08763e5-dd38-4623-aa76-894c6bed6b94" visible=true advanced=false llmAllowed=false copyingAllowed=false}
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

:::data-asset{id="5261b017-648b-463e-81e1-ee35dadb26ae" visible=true advanced=false}
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

:::code-review{id="f7eda9f3-ac7d-42bc-98bd-244dc56841a9" visible=true advanced=false}
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
