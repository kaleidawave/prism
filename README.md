# <img src="static/logo.png" height="24" /> Prism Compiler

[![Twitter](https://img.shields.io/badge/-@kaleidawave-blue?style=flat-square&logo=twitter)](https://twitter.com/kaleidawave) 
[![Issues](https://img.shields.io/github/issues/kaleidawave/prism?style=flat-square)](https://github.com/kaleidawave/prism/issues) 
[![Stars](https://img.shields.io/github/stars/kaleidawave/prism?style=flat-square)](https://github.com/kaleidawave/prism/stargazers)

Prism is *experimental* a compiler that takes declarative component definitions and creates lightweight web apps. Prism is built from the ground up. All HTML, CSS and JS parsing and rendering is done under a internal library known as [chef](https://github.com/kaleidawave/prism/tree/main/src/chef). 

Install with:

```
> npm install -g @kaleidawave/prism 
> prism info
```

*(not to be confused with highlighting library [prismjs](https://github.com/PrismJS/prism) and database toolkit [prisma](https://github.com/prisma/prisma))*

### About:

#### Web components:

Prism compiles down to native web components. Prism takes HTML templates and compiles them into native DOM api calls. It takes event bindings and compiles in attaching event listeners. Prism can output single component definitions that can be shared and work natively. Building a app with Prism consists of batch component compilation and injecting a client side router to build a SPA.

#### Data bindings:

Prism compiles a tree ahead of time onto the component definition. The tree contains hooks which can called update the dom view to match the data. A background library watches objects so data updates are based on regular js syntax and no calls to a function. The implementation leaves data reactivity to runtime so that can update the properties of web components but compiles bindings at build time to avoid vdom overhead.

#### Server side data hydration from markup:

As well as compiling client bundles Prism can also compile functions for generating the markup on the server. The design of the reactive tree also can react to set events and *get* events. This means that Prism components can replicate the data used to the generate the markup on the client. Other approaches normally send down a JSON blob to handle the client state being up to date with server markup. This approach should reduce payload size. This system is completely lazy and getting the data is a on a single property basis. The server functions are fast string concatenations. The hope is that Prism could soon output backend languages than just JavaScript & TypeScript 👀. 

#### Size comparisons:

Prism [counter example](https://gist.github.com/kaleidawave/82974b6973280c03706519ad94ab84ff) compiles to 5.35kb (1.72kb gzip). According to [webcomponents.dev](https://webcomponents.dev/blog/all-the-ways-to-make-a-web-component/) this places Prism just above Svelte but way below Preact and LitElement in terms of bundle size. Of that bundle size 4.34kb of that is the backing library (not inc router).

However if you were to use Svelte for a isomorphic site every server rendered non cached request you get has the additional JSON blob. So although your `bundle.js` may be smaller factoring in possible large JSON blobs will mean there is a greater net payload size than a Prism site.

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

#### Other decorators and methods:

```html
<script>
    @TagName("my-component") // Set components html tag name (else it will be generate automatically based of the name of the class)
    @Default({count: 1, foo: "bar", arr: ["Hello World"]) // Set a default data for the component
    @Page("*") // If the argument to page "*" it will match on all paths. Can be used as a not found page
    @Globals(someFunc) // Variables in the template matching "globalUser" are assumed to be outside the class and will not be prefixed
    @ClientGlobals(user as IUser) // Variables global to client but not server
    @Passive // Will not generate runtime bindings
    @Title("Page X") // Title for the page
    @Metadata({ description: "Description for page" }) // Metadata for server rendered pages
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
| projectPath          | ./src                                                        | The folder for `.prism` components                           |
| assetPath            | projectPath + /assets                                        | The folder with assets to include                            |
| outputPath           | ./out                                                        | The folder to place a public folder for hosting public assets |
| serverOutputPath     | outputPath + /server                                         | The folder to write functions for rendering pages            |
| templatePath         | [template.html](https://github.com/kaleidawave/prism/blob/main/src/bundle/template.html) | The HTML to inject application into                          |
| context              | isomorphic                                                   | Either `client` or `isomorphic`. Client applications will not have server functions and lack isomorphic functionality |
| buildTimings         | false                                                        | Whether to log the time it takes to build Prism sites        |
| run                  | false                                                        | If true will run dev server on client side output. Relies on [ws](https://github.com/lwsjs/local-web-server) being installed globally |
| backendLanguage      | js                                                           | Either "js" or "ts"                                          |
| disableEventElements | true                                                         | Adds disable to ssr elements with event handlers             |

Assigning these settings is first done through reading in `prism.config.json` in the current working directory. Then by looking at arguments behind any of the commands. e.g.

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