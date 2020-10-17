import nodePolyfills from "rollup-plugin-node-polyfills";

export default {
    input: "web-out/web.js",
    output: {
        name: "prism",
        file: "web-out/bundle.js",
        format: "module"
    },
    plugins: [
        nodePolyfills()
    ]
};