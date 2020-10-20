import { registerFSReadCallback, registerFSWriteCallback } from "./filesystem";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, isAbsolute, join } from "path";
import { getArguments } from "./helpers";
import { IFinalPrismSettings, makePrismSettings } from "./settings";

registerFSReadCallback((filename) => readFileSync(filename).toString());
registerFSWriteCallback((filename, content) => {
    const dir = dirname(filename);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filename, content)
});

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

export { compileApplication } from "./builders/compile-app";
export { compileSingleComponent } from "./builders/compile-component";