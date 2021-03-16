import { Component } from "../component";
import { defaultRuntimeFeatures, getPrismClient, IRuntimeFeatures, treeShakeBundle } from "./prism-client";
import { Module } from "../chef/javascript/components/module";
import { Stylesheet } from "../chef/css/stylesheet";
import { IRenderSettings, ModuleFormat, ScriptLanguages } from "../chef/helpers";
import { IFinalPrismSettings, IPrismSettings, makePrismSettings } from "../settings";
import { fileBundle } from "../bundled-files";
import { registerFSWriteCallback, registerFSReadCallback, __fileSystemReadCallback, __fileSystemWriteCallback } from "../filesystem";
import { join } from "path";
import { ExportStatement, ImportStatement } from "../chef/javascript/components/statements/import-export";

/**
 * Component cannot import another component as there single source. Use `compileSingleComponentFromFSMap`
 * for multiple components
 * @param componentSource 
 * @param partialSettings 
 */
export function compileSingleComponentFromString(
    componentSource: string, 
    partialSettings: Partial<IPrismSettings> = {}
): Map<string, string> {
    if (typeof componentSource !== "string") throw Error("compileSingleComponentFromString requires string");
    if (typeof partialSettings.outputPath === "undefined") {
        partialSettings.outputPath = "";
    }
    const outputMap = new Map();
    // swap callbacks
    const fileSystemReadCallback = __fileSystemReadCallback;
    const fileSystemWriteCallback = __fileSystemWriteCallback;
    registerFSReadCallback(filename => {
        if (filename === "/index.prism" || filename === "\\index.prism") {
            return componentSource;
        } else {
            throw Error(`Cannot read path '${filename}'`);
        }
    });
    registerFSWriteCallback((filename, content) => {
        outputMap.set(filename, content);
    });
    compileSingleComponent("", partialSettings);
    // replace callbacks
    registerFSReadCallback(fileSystemReadCallback);
    registerFSWriteCallback(fileSystemWriteCallback);
    return outputMap;
}

export function compileSingleComponentFromFSMap(
    componentSourceMap: Map<string, string>, 
    partialSettings: Partial<IPrismSettings> = {}
): Map<string, string> {
    if (!(componentSourceMap instanceof Map)) throw Error("compileSingleComponentFromFSMap requires Map");
    if (typeof partialSettings.outputPath === "undefined") {
        partialSettings.outputPath = "";
    }
    if (typeof partialSettings.projectPath === "undefined") {
        partialSettings.projectPath = ".";
    }
    // swap callbacks
    const fileSystemReadCallback = __fileSystemReadCallback;
    const fileSystemWriteCallback = __fileSystemWriteCallback;
    registerFSReadCallback(filename => {
        if (componentSourceMap.has(filename)) {
            return componentSourceMap.get(filename)!;
        } else {
            throw Error(`Cannot read path '${filename}'`);
        }
    });
    const outputMap = new Map();
    registerFSWriteCallback((filename, content) => {
        outputMap.set(filename, content);
    });
    compileSingleComponent("", partialSettings);
    // replace callbacks
    registerFSReadCallback(fileSystemReadCallback);
    registerFSWriteCallback(fileSystemWriteCallback);
    return outputMap;
}

/**
 * Generate a script for a single component. Will also generate imported components down the tree. Unlike 
 * compileSingleApplication does not do all components in src folder and does not generate router
 * @param projectPath The entry point
 * @returns Returns the component component name
 */
export function compileSingleComponent(
    projectPath: string,
    partialSettings: Partial<IPrismSettings> = {}
): string {
    const settings: IFinalPrismSettings = makePrismSettings(projectPath, partialSettings);

    const features: IRuntimeFeatures = { ...defaultRuntimeFeatures, isomorphic: settings.context === "isomorphic" };

    if (settings.buildTimings) console.time("Parse component file and its imports");
    const component = Component.registerComponent(settings.absoluteComponentPath, settings, features);
    if (settings.buildTimings) console.timeEnd("Parse component file and its imports");
    
    const clientRenderSettings: Partial<IRenderSettings> = {
        minify: settings.minify,
        moduleFormat: ModuleFormat.ESM,
        comments: settings.comments,
        scriptLanguage: settings.outputTypeScript ? ScriptLanguages.Typescript : ScriptLanguages.Javascript
    };

    for (const registeredComponent of Component.registeredComponents.values()) {
        registeredComponent.generateCode(settings);
    }

    let bundledClientModule: Module;
    if (settings.bundleOutput) {
        bundledClientModule = getPrismClient(false);
        if (settings.minify) {
            treeShakeBundle(features, bundledClientModule);
        }
        bundledClientModule.filename = join(settings.absoluteOutputPath, "component.js");
    } else {
        const prismClient = getPrismClient(false);
        prismClient.filename = join(settings.absoluteOutputPath, "prism");
        prismClient.writeToFile(clientRenderSettings);
    }
    
    const bundledStylesheet = new Stylesheet(join(settings.absoluteOutputPath, "component.css"));

    let scriptLanguage: ScriptLanguages;
    switch (settings.backendLanguage) {
        case "js": scriptLanguage = ScriptLanguages.Javascript; break;
        case "ts": scriptLanguage = ScriptLanguages.Typescript; break;
        case "rust": scriptLanguage = ScriptLanguages.Rust; break;
        default: throw Error(`Unknown script language "${settings.backendLanguage}"`);
    }
    const serverRenderSettings: Partial<IRenderSettings> = {
        scriptLanguage: settings.backendLanguage === "js" ? ScriptLanguages.Javascript : ScriptLanguages.Typescript
    };

    // This bundles all the components together into a single client module, single stylesheet
    if (settings.bundleOutput) {
        addComponentToBundle(component, bundledClientModule!, bundledStylesheet);
    } else {
        for (const [,registeredComponent] of Component.registeredComponents) {
            registeredComponent.clientModule.writeToFile(clientRenderSettings);
            if (registeredComponent.stylesheet && !registeredComponent.useShadowDOM) {
                registeredComponent.stylesheet.writeToFile({ minify: settings.minify });
            }
            if (registeredComponent.serverModule) {
                registeredComponent.serverModule.writeToFile(serverRenderSettings);
            }
        }
    }

    if (settings.buildTimings) console.time("Render and write script & style bundle");
    
    if (settings.bundleOutput) {
        // TODO temporary removing of all imports as it is bundled
        bundledClientModule!.statements = bundledClientModule!.statements
            .filter(statement => 
                !(statement instanceof ImportStatement)
            ).map(statement => 
                statement instanceof ExportStatement ?
                    statement.exported :
                    statement 
            );

        bundledClientModule!.writeToFile(clientRenderSettings);
        if (bundledStylesheet.rules.length > 0) {
            bundledStylesheet.writeToFile(clientRenderSettings);
        }
    }

    // Bundle server modules and add util functions
    // TODO current leaves rust component independent
    // TODO noBundle
    if (settings.context === "isomorphic" && settings.backendLanguage !== "rust") {
        const bundledServerModule = Module.fromString(fileBundle.get("server.ts")!, "server.ts");
        bundledServerModule.filename = join(settings.absoluteOutputPath, "component.server.js");
        for (const [, comp] of Component.registeredComponents) {
            bundledServerModule.combine(comp.serverModule! as Module);
        }

        // TODO temporary removing of all imports as it is bundled
        bundledClientModule!.statements = 
            bundledClientModule!.statements.filter(statement => 
                !(statement instanceof ImportStatement)
                );
                
        bundledServerModule.writeToFile(serverRenderSettings);
    }
    
    if (settings.buildTimings) console.timeEnd("Render and write script & style bundle");

    return component.tagName;
}

/**
 * Adds components scripts and stylesheet to a given Module and Stylesheet
 * Recursively adds the imported components
 * TODO server module
 * @param component 
 * @param scriptBundle 
 * @param styleBundle 
 */
function addComponentToBundle(
    component: Component,
    scriptBundle: Module,
    styleBundle?: Stylesheet,
    bundleComponents: Set<Component> = new Set()
): void {
    scriptBundle.combine(component.clientModule);
    if (component.stylesheet && !component.useShadowDOM && styleBundle) {
        styleBundle.combine(component.stylesheet);
    }
    for (const [, importedComponent] of component.importedComponents) {
        // Handles cyclic imports
        if (bundleComponents.has(importedComponent)) continue;

        bundleComponents.add(importedComponent);
        addComponentToBundle(importedComponent, scriptBundle, styleBundle, bundleComponents);
    }
}