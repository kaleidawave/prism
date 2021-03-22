import { filesInFolder } from "../helpers";
import { Component } from "../component";
import { getImportPath, IRenderSettings, ModuleFormat, ScriptLanguages } from "../chef/helpers";
import { Module } from "../chef/javascript/components/module";
import { defaultRuntimeFeatures, getPrismClient, IRuntimeFeatures, treeShakeBundle } from "./prism-client";
import { parseTemplateShell, writeIndexHTML } from "./template";
import { buildPrismServerModule as buildTSPrismServerModule } from "./server-side-rendering/typescript";
import { buildPrismServerModule as buildRustPrismServerModule } from "./server-side-rendering/rust";
import { Stylesheet } from "../chef/css/stylesheet";
import { Expression, Operation, VariableReference } from "../chef/javascript/components/value/expression";
import { moveStaticAssets } from "./assets";
import { IFinalPrismSettings, IPrismSettings, makePrismSettings } from "../settings";
import { exists } from "../filesystem";
import { join } from "path";
import type { runApplication } from "../node";
import { randomId } from "../templating/helpers";
import { ExportStatement, ImportStatement } from "../chef/javascript/components/statements/import-export";

/**
 * - Registers all components
 * - Resolves prism client
 * - Moves assets
 * - Combines all scripts and stylesheets
 * - Write out server modules
 * - Generate server module
 * - Write out scripts, stylesheets and shell.html
 */
export function compileApplication(
    cwd: string, 
    partialSettings: Partial<IPrismSettings> = {}, 
    runFunction?: typeof runApplication
) {
    const settings: IFinalPrismSettings = makePrismSettings(cwd, partialSettings);
    const features: IRuntimeFeatures = { ...defaultRuntimeFeatures, isomorphic: settings.context === "isomorphic" };

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

    const name = settings.bundleOutput ? "bundle" : "index";
    const jsEntryPointName = settings.versioning ? `${name}.${randomId()}.js` : `${name}.js`;
    const cssName = settings.versioning ? `${name}.${randomId()}.css` : `${name}.css`;
    const clientScriptBundle = new Module(join(settings.absoluteOutputPath, jsEntryPointName));
    const clientStyleBundle = new Stylesheet(join(settings.absoluteOutputPath, cssName));

    const template = parseTemplateShell(settings, jsEntryPointName, cssName);

    const prismClient = getPrismClient(settings.clientSideRouting);
    prismClient.filename = join(settings.absoluteOutputPath, "prism.js");
    if (settings.bundleOutput) {
        treeShakeBundle(features, prismClient);
        clientScriptBundle.combine(prismClient);
    } else {
        prismClient.writeToFile(clientRenderSettings);
    }

    if (exists(settings.absoluteAssetPath)) {
        if (settings.buildTimings) console.time("Move static assets");
        // Static styles and scripts come before any component declarations
        // TODO bad that functions does side effects and returns stuff
        const modulesAndStylesheets = moveStaticAssets(
            settings.absoluteAssetPath,
            settings.absoluteOutputPath,
            clientRenderSettings
        );
        
        if (settings.bundleOutput) {
            for (const moduleOrStylesheet of modulesAndStylesheets) {
                if (moduleOrStylesheet instanceof Module) {
                    clientScriptBundle.combine(moduleOrStylesheet);
                } else {
                    clientStyleBundle.combine(moduleOrStylesheet);
                }
            }
        } else {
            for (const moduleOrStylesheet of modulesAndStylesheets) {
                moduleOrStylesheet.writeToFile();
            }
        }

        if (settings.buildTimings) console.timeEnd("Move static assets");
    }
    
    // Used for doing rust imports TODO kinda temp
    const serverModulePaths: Array<string> = [];

    // Combine all registered components client modules and stylesheets and write out the server module separately
    if (settings.buildTimings) console.time("Combine all component scripts and styles, write out server modules");
    for (const registeredComponent of Component.registeredComponents.values()) {
        registeredComponent.generateCode(settings);

        if (settings.bundleOutput) {
            clientScriptBundle.combine(registeredComponent.clientModule);
            // If uses shadow dom the styles are written into render methods so do not output stylesheet
            if (registeredComponent.stylesheet && !registeredComponent.useShadowDOM) {
                clientStyleBundle.combine(registeredComponent.stylesheet);
            }
            if (registeredComponent.serverModule) {
                serverModulePaths.push(registeredComponent.serverModule.filename);
                registeredComponent.serverModule.writeToFile(serverRenderSettings);
            }
        } else {
            // Add `import "*clientModule"` so bundlers can bundle registered components
            clientScriptBundle.statements.push(
                new ImportStatement(
                    null, 
                    getImportPath(clientScriptBundle.filename, registeredComponent.clientModule.filename)
                )
            );
            registeredComponent.clientModule.writeToFile(clientRenderSettings);
            if (registeredComponent.stylesheet && !registeredComponent.useShadowDOM) {
                registeredComponent.stylesheet.writeToFile();
            }
            if (registeredComponent.serverModule) {
                serverModulePaths.push(registeredComponent.serverModule.filename);
                registeredComponent.serverModule.writeToFile(serverRenderSettings);
            }
        }
        
    }
    if (settings.buildTimings) console.timeEnd("Combine all component scripts and styles, write out server modules");

    // TODO temp remove all imports and exports as it is a bundle
    if (settings.bundleOutput) {
        clientScriptBundle!.statements = clientScriptBundle!.statements
            .filter(statement => 
                !(statement instanceof ImportStatement)
            ) .map(statement => 
                statement instanceof ExportStatement ?
                    statement.exported :
                    statement 
            );
    }

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
        switch (settings.backendLanguage) {
            case "rust":
                buildRustPrismServerModule(template, settings, serverModulePaths).writeToFile(serverRenderSettings);
                break;
            case "js":
            case "ts":
                buildTSPrismServerModule(template, settings).writeToFile(serverRenderSettings);
                break;
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