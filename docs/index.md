# Prism

Prism is a *experimental* isomorphic web app compiler.

### Reasons to use Prism:

##### JIT Hydration:

Prism uses a incremental hydration technique. A prism app can add event listeners without needing state. State is then progressively loaded in.

<!-- TODO animation example -->

And with this system it uses the DOM to hydrate. This means it does not have the explicit state that other solutions rely on:

```html
<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}},"page":"/",...}</script>
```

This technique enhances TTI and overall performance.
 
##### Rust SSR:

Prism can compile SSR functions to Rust. Currently all frontend *prerendering* services require a JS runtime. Next, sapper and nuxt are all based on using a JS runtime server. Prism on the other hand has support for outputting Rust modules that expose methods for *prerendering* Prism apps.

Exhibit A: [hackernews-prism](https://github.com/kaleidawave/hackernews-prism)

##### Small bundle sizes:

Prism outputs very little JS. Often on par or below the size Svelte outputs and certainty a magnitude smaller than a React app. Especially as there is also no JS state blob on SSR.

##### Built in client side routing:

Routing is done in Prism with the `@Page` decorator. No need to add a separate package. It also has built in design for layouts.

##### Others:

- Declarative component templating
- Single file components
- "Plain JS"
- Compiled to web components

### About:

Prism is experimental.

If you know are interested by some of the above points and want to try it out give it a shot. But if you are writing something with actual users and want a more stable base I would recommend [svelte](https://github.com/sveltejs/svelte), [preact](https://github.com/preactjs/preact) or [solid](https://github.com/ryansolid/solid). 