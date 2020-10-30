import { registerFSReadCallback, registerFSWriteCallback, registerFSCopyCallback, registerFSExistsCallback } from "./filesystem";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { dirname, isAbsolute, join, sep } from "path";
import { getArguments } from "./helpers";
import { IFinalPrismSettings, makePrismSettings } from "./settings";
import { spawn } from "child_process";

registerFSReadCallback((filename) => readFileSync(filename).toString());
registerFSWriteCallback((filename, content) => {
    const dir = dirname(filename);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filename, content)
});
registerFSCopyCallback((from, to) => {
    const dir = dirname(to);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    copyFileSync(from, to);
});
registerFSExistsCallback(path => {
    return existsSync(path);
});

// Re-export fs callbacks so can module users can 
export { registerFSReadCallback, registerFSWriteCallback, registerFSCopyCallback, registerFSExistsCallback };

export { compileApplication } from "./builders/compile-app";
export { compileSingleComponent } from "./builders/compile-component";

export function registerSettings(cwd: string): IFinalPrismSettings {
    let configFilePath: string;
    let startIndex = 3;
    if (process.argv[startIndex]?.endsWith("prism.config.json")) {
        if (isAbsolute(process.argv[startIndex])) {
            configFilePath = process.argv[startIndex];
        } else {
            configFilePath = join(cwd, process.argv[startIndex]);
        }
        startIndex++;
    } else {
        configFilePath = join(cwd, "prism.config.json");
    }

    let settings = {};

    if (existsSync(join(configFilePath))) {
        Object.assign(settings, JSON.parse(readFileSync(configFilePath).toString()));
    }

    const args = process.argv.slice(startIndex);

    for (const [argument, value] of getArguments(args)) {
        if (value === null) {
            Reflect.set(settings, argument, true);
        } else {
            Reflect.set(settings, argument, value);
        }
    }

    return makePrismSettings(cwd, sep, settings);
}

/**
 * Runs a prism application 
 * @param openBrowser 
 */
export function runApplication(openBrowser: boolean = false, settings: IFinalPrismSettings): Promise<void> {
    if (settings.context === "client") {
        console.log("Starting client side with ws. Close with ctrl+c");

        // Uses ws to spin up a SPA server
        return new Promise((res, rej) => {
            try {
                const shell = spawn("ws", [
                    "--directory", settings.outputPath,
                    "-f", "tiny",
                    "--spa", "index.html",
                    openBrowser ? "--open" : "",
                ], { shell: true, stdio: "pipe" });
                shell.stdout.pipe(process.stdout);
                shell.on("close", res);
                shell.on("error", rej);
            } catch (error) {
                rej(error);
                console.error("ws: " + error);
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
                console.error(error);
                rej(error);
            }
        });
    }
}