### Using the Prism compiler api

Aside from using the cli, Prism components can be compiled using the `@kaleidawave/prism` package.

##### On the web:

The `web` export 

```js
// From cdn:
import * as prism from 'https://cdn.skypack.dev/@kaleidawave/prism@latest/web';
// From npm (requires bundler): 
import * as prism from '@kaleidawave/prism/web';

const component1 = 
`<template>
    <h1>Component2 below:</h1>
    <Component2></Component2>
</template>
<script>
    import { Component2 } from "component2.prism";

    class IndexComponent extends Component {}
</script>`;

const component2 = 
`<template>
    Hello World
</template>
<script>
    export class Component2 extends Component {}
</script>`;

// Compiling single component
const files1 = prism.compileSingleComponentFromString(component2);

// With settings *1
const settings = { minify: true };

// Compiling multiple components using a map to represent a filesystem
const fs_map = new Map([["/index.prism", component1], ["/component2.prism", component2]]);
const files2 = prism.compileSingleComponentFromFSMap(fs_map, settings);
```

**Notice that the component filenames must be absolute. The entry component is `/index.prism`**

\*1 Full settings can be found [here](https://github.com/kaleidawave/prism/blob/85b9048035d624dc753a4ecf457d422c07b98d3a/src/settings.ts#L3-L25)

##### On node:

Same as web, node exports `compileSingleComponentFromString` and `compileSingleComponentFromFSMap` for compiling components. 

```js
// CJS
const prism = require("@kaleidawave/prism");
// MJS
import * as prism from "@kaleidawave/prism/import";
```

- TODO FS CALLBACK OVERWRITE EXPLANATION
- TODO BUILDING PRISM APPLICATION