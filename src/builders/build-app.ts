import { filesInFolder } from "../helpers";
import { settings } from "../settings";
import { Component } from "../component";
import { IRenderSettings, ModuleFormat, ScriptLanguages } from "../chef/helpers";
import { Module } from "../chef/javascript/components/module";
import { getPrismClient } from "./prism-client";
import { spawn } from "child_process";
import { join } from "path";
import { generateServerModule } from "./prism-server";
import { buildIndexHtml } from "./client-bundle";
import { Stylesheet } from "../chef/css/stylesheet";
import { Expression, Operation } from "../chef/javascript/components/value/expression";
import { VariableReference } from "../chef/javascript/components/value/variable";
import { moveStaticAssets } from "./assets";
import { existsSync, readFileSync } from "fs";

/**
 * TODO explain
 * - Registers all components
 * - 
 */
export function compileApplication() {
    if (settings.buildTimings) console.time("Parse component files");
    for (const filepath of filesInFolder(settings.absoluteProjectPath)) {
        // Only .prism files that not skipped
        // TODO what about css, js and other assets in component paths
        if (filepath.endsWith(".prism") && !filepath.endsWith(".skip.prism")) {
            Component.registerComponent(filepath);
        }
    }
    if (settings.buildTimings) console.timeEnd("Parse component files");

    const clientRenderSettings: Partial<IRenderSettings> = {
        minify: settings.minify,
        moduleFormat: ModuleFormat.ESM,
        comments: false
    };

    const serverRenderSettings: Partial<IRenderSettings> = {
        minify: false,
        moduleFormat: settings.backendLanguage === "js" ? ModuleFormat.CJS : ModuleFormat.ESM,
        scriptLanguage: settings.backendLanguage === "ts" ? ScriptLanguages.Typescript : ScriptLanguages.Javascript,
        comments: true,
        includeExtensionsInImports: settings.deno
    };

    const clientScriptBundle = new Module();
    const clientStyleBundle = new Stylesheet();

    // TODO versioning
    clientScriptBundle.filename = join(settings.absoluteOutputPath, "bundle.js");
    clientStyleBundle.filename = join(settings.absoluteOutputPath, "bundle.css");

    const prismClient = getPrismClient(settings.clientSideRouting);
    clientScriptBundle.combine(prismClient);

    if (existsSync(settings.absoluteAssetPath)) {
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

    // Combine all registered components client modules and stylesheets and write out the server module separately
    for (const [, registeredComponent] of Component.registeredComponents) {
        clientScriptBundle.combine(registeredComponent.clientModule);
        clientStyleBundle.combine(registeredComponent.stylesheet);
        registeredComponent.serverModule?.writeToFile(serverRenderSettings);
    }

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
        generateServerModule(join(settings.absoluteServerOutputPath, "prism")).writeToFile(serverRenderSettings);
    }

    // Write out files
    if (settings.buildTimings) console.time("Render and write script & style bundle");
    clientScriptBundle.writeToFile(clientRenderSettings);
    clientStyleBundle.writeToFile(clientRenderSettings);
    if (settings.buildTimings) console.timeEnd("Render and write script & style bundle");

    // Build the index / shell page to serve
    // This is also built under context===isomorphic to allow for offline with service workers
    const indexHTML = join(settings.absoluteOutputPath, settings.context === "client" ? "index.html" : "shell.html");
    buildIndexHtml().writeToFile(clientRenderSettings, indexHTML);

    if (settings.run) {
        runApplication(settings.run === "open");
    }
}

/**
 * Runs a prism application 
 * @param openBrowser 
 */
export function runApplication(openBrowser: boolean = false): Promise<void> {
    if (settings.context === "client") {
        console.log("Starting client side with ws. Close with ctrl+c");

        // Uses ws to spin up a SPA server
        return new Promise((res, rej) => {
            try {
                const shell = spawn("ws", [
                    "--directory", settings.outputPath + "/client",
                    "-f", "tiny",
                    "--spa", "index.html",
                    openBrowser ? "--open" : "",
                    "", ""
                ], { shell: true, stdio: "pipe" });
                shell.stdout.pipe(process.stdout);
                shell.on("close", res);
                shell.on("error", rej);
            } catch (error) {
                rej(error);
            }
        });
    } else {
        // Run some server module
        let command: string;
        const pkgJSON = join(process.cwd(), "package.json");
        if (existsSync(pkgJSON)) {
            const pkg = JSON.parse(readFileSync(pkgJSON).toString());
            if (pkg.scripts?.start) {
                command = "npm start";
            } else if (pkg.main) {
                command = `node ${pkg.main}`;
            } else {
                command = `node index.js`;
            }
        } else {
            command = `node index.js`;
        }

        console.log(`Running "${command}"`);

        return new Promise((res, rej) => {
            try {
                const shell = spawn(command, { shell: true, stdio: "pipe" });
                shell.stdout.pipe(process.stdout);
                shell.on("close", res);
                shell.on("error", rej);
            } catch (error) {
                rej(error);
            }
        });
    }
}