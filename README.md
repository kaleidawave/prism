# <img src="static/logo.png" height="24" /> Prism Compiler 

[![Twitter](https://img.shields.io/badge/-@kaleidawave-blue?style=flat-square&logo=twitter)](https://twitter.com/kaleidawave) 
[![Issues](https://img.shields.io/github/issues/kaleidawave/prism?style=flat-square)](https://github.com/kaleidawave/prism/issues) 
[![Stars](https://img.shields.io/github/stars/kaleidawave/prism?style=flat-square)](https://github.com/kaleidawave/prism/stargazers)
[![On NPM](https://img.shields.io/github/package-json/v/kaleidawave/prism?color=red&logo=npm&style=flat-square)](https://www.npmjs.com/package/@kaleidawave/prism)
![Node Version](https://img.shields.io/node/v/@kaleidawave/prism?style=flat-square&logo=node.js)

Prism is a *experimental* compiler that takes declarative component definitions and creates lightweight web apps. Prism is not a stable production framework, instead a proof of concept of a better isomorphic implementations. Prism is built from the ground up. All HTML, CSS and JS parsing and rendering is done under a internal library known as [chef](https://github.com/kaleidawave/prism/tree/main/src/chef). 

Install with:

```
> npm install -g @kaleidawave/prism 
> prism info
```

*(not to be confused with highlighting library [prismjs](https://github.com/PrismJS/prism) and database toolkit [prisma](https://github.com/prisma/prisma))*

### [Quick start tutorial](https://github.com/kaleidawave/prism/blob/main/docs/quickstart.md)

## Ultra efficient isomorphic. No JSON state, No *rerender* on hydration:

Prism compiles in getter functions for getting the state from the HTML markup. Events listeners are added with no need to *rerender*. The generated client side code is designed to work with existing HTML or elements generated at runtime. Virtualized state means that state can exist without being in the JS vm. When state is needed only then is it loaded into JS and cached for subsequent gets. This avoids the large JSON state blobs that exist on all other isomorphic solutions. This solution works for dynamic HTML. This should lead to smaller payloads and a faster time to interactive.

### Server side rendering on non JS runtime:

For the server, Prism compiles components to ultra fast string concatenations avoiding the need for server side DOM. Prism can also compile string concatenation functions for Rust lang. See the [Prism Hackernews Clone](https://github.com/kaleidawave/hackernews-prism). This allows to write the markup once avoiding desync hydration issues and the time spent rewriting the render functions. It also acts as a checking step verifying correct HTML and type issues. [Hopefully more backend languages in the future](https://github.com/kaleidawave/prism/issues/19)

### Super small runtime:

Prism [counter example](https://github.com/kaleidawave/prism/blob/d91d3e7b0bd21715f6ee9b4cdc4dc3bc3c156613/examples/primitives/counter.prism) compiles to 2kb (1kb gzip). According to [webcomponents.dev](https://webcomponents.dev/blog/all-the-ways-to-make-a-web-component/) this makes Prism the smallest framework. Of that bundle size 1.41kb is prism runtime library.

There is also the benefit that Prism does not need as JSON blob to do hydration on the client side. So for other frameworks, even if your `bundle.js` is 10kb you may have another 6kb of preload data sent down with each request as well that needs to be parsed, loaded etc. With Prism the _only_ JS that is needed is the bundle.

### Web components authorization:

Prism compiles down to native web components. Prism takes HTML templates and compiles them into native DOM api calls. It takes event bindings and compiles in attaching event listeners. Prism can output single component definitions that can be shared and work natively. Building a app with Prism consists of batch component compilation and injecting a client side router to build a SPA.

### Development:

Prism does not have any editor plugins. However association `.prism` files to be interpreted as HTML works well as Prism is a extension of HTML. Although it does not provide full intellisense you get all the syntax highlighting and emmet.

```json
"files.associations": {
    "*.prism": "html"
}
```

### Single file components and templating syntax:

Prism uses a similar style single file components to vue and svelte:

```html
<template>
    <h3>Counter</h3>
    <h5 $title="count">Current count: {count}</h5>
    <button @click="increment">Increment</button>
</template>

<script>
    @Default({count: 0})
    class CounterComponent extends Component<{count: number}> {
        increment() {
            this.data.count++;
        }
    }
</script>

<style>
    h5 {
        color: red;
    }
</style>
```

Text interpolation is handled by inclosing any value inside `{}`. To make a attribute dynamic it is prefixed with `$`. For events the key is the name of the event prefixed with `@` and the value points to the name of a method or function. In the following examples you will see a type argument sent to component which corresponds to the data type. This helps Prism with returning state from markup as the markup is all text and there may need to be numbers etc. It is also used by the reactivity binding framework for creating deep observables.

For importing components:

```html
<template>
    <h3>{postTitle}</h3>
    ...
</template>

<script>
    // It is important that the class is exported
    export class PostComponent extends Component<{postTitle: string}> {}
</script>
```

```html
<template>
    <PostComponent $data="post"></PostComponent>
</template>

<script>
    import {PostComponent} from "./postComponent.prism";
    ...
</script>
```

For slots / sending children to components the `<slot></slot>` component is used:

```html
<template>
    <div class="some-wrapper">
        <!-- It is important that the slot is a single child -->
        <slot></slot>
    </div>
</template>
```

Conditionals rendering:

```html
<template>
    <!-- If with no else -->
    <div #if="count > 5">Count greater than 5</div>
    <!-- If with else -->
    <div #if="count === 8">Count equal to 8</div>
    <div #else>Count not equal to 8</div>
</template>
```

Iterating over arrays:

```html
<template>
    <ul #for="const x of myArray">
        <li>{x}</li>
    </ul>
</template>
```

For dynamic styles:

```html
<template>
    <h1 $style="color: userColor;">Hello World</h1>
</template>

<script>
    interface IComponentXData {color: string}
    class ComponentX extends Component<IComponentXData> {
        setColor(color) {
            this.data.userColor = color;
        }
    }
</script>
```

#### Client side routing

```html
<template>
    <h1>User {username}</h1>
</template>

<script>
    @Page("/user/:username")
    class ComponentX extends Component<{username: string}> {
        // "username" matches the value of the parameter username specified in the url matcher:
        load({username}) {
            this.data.username = username;
        }
    }
</script>
```

Performing a client side routing call can be done directly on a anchor tag:

```html
<template>
    <!-- "relative" denotes to perform client side routing -->
    <!-- href binding is done at runtime so href can be dynamic attribute -->
    <a relative $href="`/user/${username}`">
</template>
```

or in javascript

```js
await Router.goTo("/some/page");
```

There is also layouts which when the page is routed to will be inside of the layout. Layouts use the previous slot mechanics for position the page.

```html
...
<script>
    @Layout
    export class MainLayout extends Component {}
</script>
```

```html
...
<script>
    import {MainLayout} from "./main-layout.prism"

    @Page("/")
    @UseLayout(MainLayout)
    export class MainLayout extends Component {}
</script>
```

**(Also note Layouts extends Components and can have a internal state)**

#### Web components

Prism components extend the `HTMLElement` class. This allows for several benefits provided by inbuilt browser functionality:

- Firing native events on component
- Reduced bundle size by relying on the browser apis for binding JS to elements
- Standard interface for data (with the hope of interop with other frameworks)

##### Web component compilation:

One of the problems of web component is that to issue a single component with a framework like React, Vue or Angular you also have to package the framework runtime with the component. This means if you implement a web component built with vue and another built with React into you plain js site you have a huge bundle size with two frameworks bundled. Web component are meant to be modular and lightweight which is not the case when 90% of the component is just framework runtime. 

Prism attempts to move more information to build time so that the runtime is minimal. As it leaves reactivity to runtime it allows data changes to be reflected in the view. It also provides the ability to detect mutation so array methods like `push` and `pop` can be used. 

#### Rust backend compilation:

As of 1.3.0 prism supports compiling server render functions to native rust functions. These functions are framework independent, fast string concatenations and strongly typed. Obviously transpiling between is incredibly difficult and while Prism can create its own Rust ast it can't really convert custom use code from TS to Rust. So there is a decorator that can be added to functions `@useRustStatement` that will insert the value into the Rust module rather than the existing function definition. This code can do an import or as shown in the example below redefine the function:

```html
<template>
    <h1>{uppercase(x)}</h1>
</template>

<script>
    @useRustStatement(`fn uppercase(string: String) -> String { return string.to_uppercase(); }`)
    function uppercase(str: string) {
        return str.toUpperCase();
    }

    @Globals(uppercase)
    class SomeComponent extends Component<{x: string}> {}
</script>
```

#### Other decorators and methods:

```html
<script>
    @TagName("my-component") // Set components html tag name (else it will be generate automatically based of the name of the class)
    @Default({count: 1, foo: "bar", arr: ["Hello World"]) // Set a default data for the component
    @Page("*") // If the argument to page "*" it will match on all paths. Can be used as a not found page
    @Globals(someFunc) // Calls to "someFunc" in the template are assumed to be outside the class and will not be prefixed
    @ClientGlobals(user as IUser) // Variables global to client but not server
    @Passive // Will not generate runtime bindings
    @Title("Page X") // Title for the page
    @Metadata({ description: "Description for page" }) // Metadata for server rendered pages
    @Shadow // Use shadow DOM for component
    class X extends Component<...> {

        // Will fire on client side routing to component. Can get and load state
        load(routerArgs) {}

        // Will fire on the component connecting. Fires under connectedCallback();
        connected() {}

        // Will fire on the component disconnecting. Fires under disconnectedCallback();
        disconnected() {}
    }
</script>
```

#### Command line arguments:

| Name:                | Defaults:                                                    | Explanation:                                                 |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| minify               | false                                                        | Whether to minify the output. This includes HTML, CSS and JS |
| comments             | false                                                        | Whether to include comments in bundle output                 |
| componentPath        | ./index.prism                                                | (for `compile-component`) Path to the component              |
| projectPath          | ./views                                                      | (for `compile-app`) The folder of `.prism` components        |
| assetPath            | projectPath + /assets                                        | The folder with assets to include                            |
| outputPath           | ./out                                                        | The folder to build scripts, stylesheets and other assets to |
| serverOutputPath     | outputPath + /server                                         | The folder to write functions for rendering pages & components |
| templatePath         | [template.html](https://github.com/kaleidawave/prism/blob/main/src/bundle/template.html) | The HTML shell to inject the application into |
| context              | isomorphic                                                   | Either `client` or `isomorphic`. Client applications will not have server functions and lack isomorphic functionality |
| backendLanguage      | js                                                           | Either "js", "ts" or "rust"                                  |
| buildTimings         | false                                                        | Whether to log the compilation duration                      |
| relativeBasePath     | "/"                                                          | The index path the site is hosted under. Useful for GH pages etc |
| clientSideRouting    | true                                                         | Whether to do client side routing |
| run                  | false                                                        | If true will run dev server on client side output |
| disableEventElements | true                                                         | Adds disable to ssr elements with event handlers             |
| versioning           | true                                                         | Adds a unique id onto the end of output resources for versioning reasons |
| declarativeShadowDOM | false                                                        | Enables [DSD](https://web.dev/declarative-shadow-dom/) for SSR the content of web components with shadow dom |
| deno                 | false                                                        | Whether to add file extensions to the end of imports. For doing SSR  |
| bundleOutput         | true                                                         | Whether to concatenate all modules together instead of later with a bundler  |
| outputTypeScript     | false                                                        | Output client modules with TypeScript syntax (for doing client ts checking) |
| includeCSSImports    | false                                                        | Whether to include `import "*.css"` for components |

Assigning these settings is first done through reading in `prism.config.json` in the current working directory. Then by looking at arguments after any commands. e.g.

```
prism compile-app --projectPath "./examples/pages" --run open
```

#### Assets:

Any files found under the `assetPath` will be moved to the `outputPath` along with the client style and script bundle. Any files in `assetPath/scripts` or `assetPath/styles` will be added the client side bundle.

### License:

Licensed under [MIT](https://github.com/kaleidawave/prism/blob/master/LICENSE)

### Current drawbacks

- Prism and Chef is experimental and unstable
- Prism can only react to the data property on a component (no outside data)
- Prism only reacts to accessible properties on objects. This means types like mutating entries `Map` and `Set` will not see those changes reflected in the frontend view
