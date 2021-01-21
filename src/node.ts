import {
    registerFSCopyCallback, registerFSExistsCallback,
    registerFSPathInfoCallback, registerFSReadCallback,
    registerFSReadDirectoryCallback, registerFSWriteCallback,
    registerPathBasenameFunction, registerPathDirnameFunction,
    registerPathExtnameFunction, registerPathIsAbsoluteFunction, 
    registerPathJoinFunction, registerPathRelativeFunction, 
    registerPathResolveFunction, setPathSplitter
} from "./filesystem";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, lstatSync } from "fs";
import { getArguments } from "./helpers";
import { IFinalPrismSettings, makePrismSettings } from "./settings";
import { createServer } from "http";
import { emitKeypressEvents } from "readline";
import { exec } from "child_process";
import { dirname, extname, join, basename, relative, resolve, isAbsolute, sep } from "path";

registerFSReadCallback(filename => readFileSync(filename).toString());
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
registerFSExistsCallback(existsSync);
registerFSReadDirectoryCallback(readdirSync);
registerFSPathInfoCallback(lstatSync);
registerPathBasenameFunction(basename);
registerPathDirnameFunction(dirname);
registerPathExtnameFunction(extname);
registerPathIsAbsoluteFunction(isAbsolute);
registerPathJoinFunction(join);
registerPathRelativeFunction(relative);
registerPathResolveFunction(resolve);
setPathSplitter(sep);

// Re-export fs callbacks so module users can overwrite existing node fs behavior
export { registerFSCopyCallback, registerFSExistsCallback, registerFSPathInfoCallback, registerFSReadCallback, registerFSReadDirectoryCallback, registerFSWriteCallback };

export { compileApplication } from "./builders/compile-app";
export { compileSingleComponent } from "./builders/compile-component";
export { makePrismSettings } from "./settings";

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

    return makePrismSettings(cwd, settings);
}

/**
 * Runs a client side prism application 
 * @param openBrowser Whether to open the browser to the site
 */
export function runApplication(openBrowser: boolean = false, settings: IFinalPrismSettings): Promise<void> {
    const htmlShell = join(settings.absoluteOutputPath, settings.context === "client" ? "index.html" : "shell.html");
    return new Promise((res, rej) => {
        const port = 8080
        const server = createServer(function (req, res) {
            const path = join(settings.absoluteOutputPath, req.url!);
            switch (path.split(".").pop()) {
                case "js": res.setHeader("Content-Type", "text/javascript"); break;
                case "css": res.setHeader("Content-Type", "text/css"); break;
                case "ico": res.setHeader("Content-Type", "image/vnd.microsoft.icon"); break;
                default: res.setHeader("Content-Type", "text/html"); break;
            }
            if (existsSync(path) && lstatSync(path).isFile()) {
                res.write(readFileSync(path));
            } else {
                res.write(readFileSync(htmlShell));
            }
            res.end();
        });

        server.addListener("error", rej);
        server.listen(port);

        emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        const keyReader = process.stdin.on("keypress", (_, key) => {
            if (key.ctrl && key.name === "c") {
                console.log("Closing Server");
                server.close();
                keyReader.end();
                keyReader.destroy();
                res();
            }
        });

        const url = `http://localhost:${port}`;

        if (openBrowser) {
            let start: string;
            switch (process.platform) {
                case "darwin": start = "open"; break;
                case "win32": start = "start"; break;
                default: throw Error("Unknown Platform");
            };
            exec(`${start} ${url}`);
        }
        console.log(`Server started at ${url}, stop with ctrl+c`);
    });
}