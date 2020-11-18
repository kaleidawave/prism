import { filesInFolder } from "../helpers";
import { Component } from "../component";
import { IRenderSettings, ModuleFormat, ScriptLanguages } from "../chef/helpers";
import { Module } from "../chef/javascript/components/module";
import { getPrismClient, IRuntimeFeatures, treeShakeBundle } from "./prism-client";
import { parseTemplateShell, writeIndexHTML } from "./template";
import { buildPrismServerModule as buildTSPrismServerModule } from "./server-side-rendering/typescript";
import { buildPrismServerModule as buildRustPrismServerModule } from "./server-side-rendering/rust";
import { join } from "path";
import { Stylesheet } from "../chef/css/stylesheet";
import { Expression, Operation } from "../chef/javascript/components/value/expression";
import { VariableReference } from "../chef/javascript/components/value/variable";
import { moveStaticAssets } from "./assets";
import { IFinalPrismSettings } from "../settings";
import { exists } from "../filesystem";
import type { runApplication } from "../node";
import { randomId } from "../templating/helpers";

/**
 * - Registers all components
 * - Resolves prism client
 * - Moves assets
 * - Combines all scripts and stylesheets
 * - Write out server modules
 * - Generate server module
 * - Write out scripts, stylesheets and shell.html
 */
export function compileApplication(settings: IFinalPrismSettings, runFunction?: typeof runApplication) {
    const features: IRuntimeFeatures = {
        conditionals: false,
        isomorphic: settings.context === "isomorphic",
        observableArrays: false,
        subObjects: false,
        svg: false
    }

    if (settings.buildTimings) console.time("Parse component files");
    for (const filepath of filesInFolder(settings.absoluteProjectPath)) {
        // Only .prism files that not skipped
        // TODO what about css, js and other assets in component paths
        if (filepath.endsWith(".prism") && !filepath.endsWith(".skip.prism")) {
            Component.registerComponent(filepath, settings, features);
        }
    }
    if (settings.buildTimings) console.timeEnd("Parse component files");

    const clientRenderSettings: Partial<IRenderSettings> = {
        minify: settings.minify,
        moduleFormat: ModuleFormat.ESM,
        comments: settings.comments
    };

    const serverRenderSettings: Partial<IRenderSettings> = {
        minify: false,
        moduleFormat: settings.backendLanguage === "js" ? ModuleFormat.CJS : ModuleFormat.ESM,
        scriptLanguage: settings.backendLanguage === "ts" ? ScriptLanguages.Typescript : ScriptLanguages.Javascript,
        comments: true,
        includeExtensionsInImports: settings.deno
    };

    const jsName = `bundle.${randomId()}.js`;
    const cssName = `bundle.${randomId()}.css`;
    const clientScriptBundle = new Module(join(settings.absoluteOutputPath, jsName));
    const clientStyleBundle = new Stylesheet(join(settings.absoluteOutputPath, cssName));
    
    const template = parseTemplateShell(settings, jsName, cssName);

    const prismClient = getPrismClient(settings.clientSideRouting);
    treeShakeBundle(features, prismClient);
    clientScriptBundle.combine(prismClient);

    if (exists(settings.absoluteAssetPath)) {
        if (settings.buildTimings) console.time("Move static assets");
        // Static styles and scripts come before any component declarations
        // TODO bad that functions does side effects and returns stuff
        const modulesAndStylesheets = moveStaticAssets(
            settings.absoluteAssetPath,
            settings.absoluteOutputPath,
            clientRenderSettings
        );

        for (const x of modulesAndStylesheets) {
            if (x instanceof Module) {
                clientScriptBundle.combine(x);
            } else {
                clientStyleBundle.combine(x);
            }
        }

        if (settings.buildTimings) console.timeEnd("Move static assets");
    }

    const serverModulePaths: Array<string> = [];

    // Combine all registered components client modules and stylesheets and write out the server module separately
    if (settings.buildTimings) console.time("Combine all component scripts and styles, write out server modules");
    for (const [, registeredComponent] of Component.registeredComponents) {
        clientScriptBundle.combine(registeredComponent.clientModule);
        if (registeredComponent.stylesheet && !registeredComponent.useShadowDOM) {
            clientStyleBundle.combine(registeredComponent.stylesheet);
        }
        if (registeredComponent.serverModule) {
            serverModulePaths.push(registeredComponent.serverModule.filename);
            registeredComponent.serverModule.writeToFile(serverRenderSettings);
        }
    }
    if (settings.buildTimings) console.timeEnd("Combine all component scripts and styles, write out server modules");

    // TODO temp remove all imports and exports as it is a bundle
    clientScriptBundle.removeImportsAndExports();

    // Initialize routing once all component are registered
    if (settings.clientSideRouting) {
        clientScriptBundle.statements.push(
            new Expression({
                lhs: VariableReference.fromChain("Router", "init"),
                operation: Operation.Call
            })
        );
    }

    if (settings.context === "isomorphic") {
        if (settings.backendLanguage === "rust") {
            buildRustPrismServerModule(template, settings, serverModulePaths).writeToFile(serverRenderSettings);
        } else {
            buildTSPrismServerModule(template, settings).writeToFile(serverRenderSettings);
        }
    }

    // Write out files
    if (settings.buildTimings) console.time("Render and write script & style bundle");
    clientScriptBundle.writeToFile(clientRenderSettings);
    if (clientStyleBundle.rules.length > 0) {
        clientStyleBundle.writeToFile(clientRenderSettings);
    }
    if (settings.buildTimings) console.timeEnd("Render and write script & style bundle");

    // Build the index / shell page to serve
    // This is also built under context===isomorphic to allow for offline with service workers
    writeIndexHTML(template, settings, clientRenderSettings);

    console.log(`Wrote out bundle.js and bundle.css to ${settings.outputPath}${settings.context === "isomorphic" ? ` and wrote out server templates to ${settings.serverOutputPath}` : ""}`);
    console.log("Built Prism application");

    if (runFunction && settings.run) {
        runFunction(settings.run === "open", settings);
    }
}