# Chef

Chef is a parser and renderer currently supporting HTML, JavaScript (inc most of TypeScript) and CSS. Chef is built on ES6 classes so it is very simple to construct AST's. Chef is written in TypeScript so building ASTs should be (mostly) type safe. Chef is used under the Prism compiler but does not contain any specific Prism syntax or traits.

```js
> Expression.fromString("a < 2 || b(c.d)");
> Expression {
    lhs: Expression {
        lhs: VariableReference { name: "a" },
        operation: Operation.LessThan,
        rhs: Value { value: "4", type: Type.number }
    },
    operation: Operation.LogOr,
    rhs: Expression {
        lhs: VariableReference { name: "b" },
        operation: Operation.Call,
        rhs: VariableReference { name: "d", parent: VariableReference { name: "c" } }
    }
}
```

As well as parsing, Chef can generate and serialize nodes:

```js
> const expr = new Expression({
    lhs: new Value(4, Type.number),
    operation: Operation.Add,
    rhs: new VariableReference("x")
});

> expr.render();
> "4 + x"
```

For more examples of code generation view [tests](https://github.com/kaleidawave/prism/blob/main/tests/chef/javascript/javascript.render.test.ts)

#### HTML parsing integration:

As JS and CSS can be imbedded in HTML:

```html
<body>
    <h1>Some text</h1>
    <script>
        console.log("Hello World");
    </script>
    <style>
        h1 {
            color: red;
        }
    </style>
</body>
```

```js
> const [h1, script, style] = HTMLElement.fromString(...).children;
> h1.children[0].text
> "Some Text"
> script.module
> Module {...}
> style.stylesheet
> Stylesheet {...}
```

#### Speed comparisons:

Through some rough testing Chef with `@babel/parsing` and `@babel/generator` Chef appears 2x times faster parsing and 6x faster at serializing the AST to a string.

#### JS coverage & testing:

Chef is not built alongside the spec so there are several things that are missed. Notably less used language features with statements, blocks, label statements, deep destructuring. But the tests have a good coverage over most used syntax. Just like Prism, Chef is experimental so getting it working is a greater priority than producing a production stage parser and renderer. I am hoping to using a external test set (such as [test262](https://github.com/tc39/test262)) for Chef to be more stable.

#### Utilities:

There are several non parsing based utilities included in Chef.

- `javascript/utils/variables.ts`
    - Finding variables: returns list of variables in a construct
    - Aliasing variables: prefixes variables. e.g. `x` ➡ `this.data.x`
    - Replacing variables: replaces variables with any `IValue`. Effectively substitution
- `javascript/utils/types.ts` : Resolves types by following references. Will return a map of properties that a type has
- `javascript/utils/reverse.ts` : Attempts to create a function that resolve the variables used to construct the final value

#### TypeScript

Chef includes a lot of TypeScript syntax such as interfaces, type signatures (variables, parameters, function return types), decorators and generic parameters. Type constraints and some other syntax is not implemented. Chef also does not do any type checking.

Compiling a node with the `settings.scriptLanguage` value will only output JS. And as TypeScript is a superset of JS removing TypeScript syntax returns valid JS code.

#### Nested CSS rules:

The CSS parser can process nested rules similar to scss (inc `&` for referencing the current selector):

```scss
div {
    h1 {
        color: red;
    }
    
    &.class1 {
        h2 {
            text-align: center;
        }
    }  
}
```

Will be compiled to: 

```css
div h1 {
    color: red;
}

div.class1 h2 {
    text-align: center;
}
```

(expanding nested rules is done as parse time)

#### Dynamic URLs:

Chef also can process URL syntax with variables similar to that of express: Minor addition that Prism uses

```js
> const dynamicUrl = stringToDynamicUrl("/users/:userID");
// dynamicUrlToRegexPattern will produce a RegExpr that will only match on valid URLs and will return a groups of arguments
> dynamicUrlToRegexPattern(dynamicUrl)
> RegExpLiteral {
  expression: "^\\/users\\/(?<userID>(.+?))$"
}
```