import { Component } from "../component";
import { getPrismClient, IRuntimeFeatures, treeShakeBundle } from "./prism-client";
import { Module } from "../chef/javascript/components/module";
import { Stylesheet } from "../chef/css/stylesheet";
import { join } from "path";
import { IRenderSettings, ModuleFormat, ScriptLanguages } from "../chef/helpers";
import { IPrismSettings, makePrismSettings } from "../settings";
import { fileBundle } from "../bundled-files";

/**
 * Generate a script for a single client
 * @param componentPath 
 */
export async function compileSingleComponent(
    componentPath: string,
    cwd: string,
    partialSettings: Partial<IPrismSettings>
): Promise<void> {
    const settings = makePrismSettings(cwd, partialSettings);
    const features: IRuntimeFeatures = { 
        conditionals: false, 
        isomorphic: settings.context === "isomorphic", 
        observableArrays: false,
        subObjects: false,
        svg: false
    }

    if (settings.buildTimings) console.time("Parse component file and its imports");
    const component = await Component.registerComponent(componentPath, settings, features);
    if (settings.buildTimings) console.timeEnd("Parse component file and its imports");

    const bundledClientModule = await getPrismClient(false);
    treeShakeBundle(features, bundledClientModule);
    const bundledStylesheet = new Stylesheet();

    // This bundles all the components together into a single client module, single stylesheet
    addComponentToBundle(component, bundledClientModule, bundledStylesheet);

    // TODO temporary removing of all imports and exports as it is a bundle 
    bundledClientModule.removeImportsAndExports();

    if (settings.buildTimings) console.time("Render and write script & style bundle");

    const clientRenderSettings: Partial<IRenderSettings> = {
        minify: settings.minify,
        moduleFormat: ModuleFormat.ESM,
        comments: settings.comments
    };

    bundledClientModule.writeToFile(clientRenderSettings, join(settings.absoluteOutputPath, "component.js"));
    bundledStylesheet.writeToFile(clientRenderSettings, join(settings.absoluteOutputPath, "component.css"));

    if (settings.context === "isomorphic") {
        const bundledServerModule = Module.fromString(fileBundle.get("server.ts")!);
        bundledServerModule.filename = join(settings.absoluteOutputPath, "component.server.js");
        for (const [, comp] of Component.registeredComponents) {
            bundledServerModule.combine(comp.serverModule!);
        }
        bundledServerModule.removeImportsAndExports();
        bundledServerModule.writeToFile({
            scriptLanguage: settings.backendLanguage === "js" ? ScriptLanguages.Javascript : ScriptLanguages.Typescript
        });
    }
    if (settings.buildTimings) console.timeEnd("Render and write script & style bundle");

    console.log(`Built web component, use with "<${component.tag}></${component.tag}>" or "document.createElement("${component.tag}")"`);
}

/**
 * Adds components scripts and stylesheet to a given Module and Stylesheet
 * Recursively adds the imported components
 * TODO server module
 * @param component 
 * @param scriptBundle 
 * @param styleBundle 
 */
function addComponentToBundle(component: Component, scriptBundle: Module, styleBundle?: Stylesheet): void {
    scriptBundle.combine(component.clientModule);
    if (component.stylesheet && styleBundle) {
        styleBundle.combine(component.stylesheet);
    }
    for (const [, importedComponent] of component.importedComponents) {
        addComponentToBundle(importedComponent, scriptBundle, styleBundle);
    }
}