import { join, sep } from "path";
import { IRuntimeFeatures } from "../../src/builders/prism-client";
import { Component } from "../../src/component";
import { makePrismSettings } from "../../src/settings";

const falseRuntimeSettings: IRuntimeFeatures = Object.freeze({
    conditionals: false,
    isomorphic: false,
    observableArrays: false,
    subObjects: false,
    svg: false
});

const defaultSettings = makePrismSettings(process.cwd(), sep, { context: "client" });

test("observableArrays", async () => {
    const runtimeFeatures = { ...falseRuntimeSettings };
    await Component.registerComponent(join(__dirname, "../../examples/primitives/post.prism"), defaultSettings, runtimeFeatures);

    expect(runtimeFeatures).toMatchObject({
        ...falseRuntimeSettings,
        observableArrays: true,
        subObjects: true
    });
});

test("conditionals", async () => {
    const runtimeFeatures = { ...falseRuntimeSettings };
    await Component.registerComponent(join(__dirname, "../../examples/primitives/conditional.prism"), defaultSettings, runtimeFeatures);

    expect(runtimeFeatures).toMatchObject({
        ...falseRuntimeSettings,
        conditionals: true
    });
});

test("svg", async () => {
    const runtimeFeatures = { ...falseRuntimeSettings };
    await Component.registerComponent(join(__dirname, "../../examples/primitives/svg.prism"), defaultSettings, runtimeFeatures);

    expect(runtimeFeatures).toMatchObject({
        ...falseRuntimeSettings,
        svg: true
    });
});

test("subObjects", async () => {
    const runtimeFeatures = { ...falseRuntimeSettings };
    await Component.registerComponent(join(__dirname, "../../examples/primitives/objects.prism"), defaultSettings, runtimeFeatures);

    expect(runtimeFeatures).toMatchObject({
        ...falseRuntimeSettings,
        subObjects: true
    });
});