import { join, isAbsolute } from "path";
import { readFileSync, existsSync } from "fs";
import { getArguments } from "./helpers";

export interface IPrismSettings {
    minify: boolean, // Removes whitespace for space saving in output
    backendLanguage: "js" | "ts", // The languages to output server templates in
    comments: boolean | "docstring" | "info", // Leave comments in TODO comment levels
    projectPath: string, // The path to the components folder OR a single component
    assetPath: string | null, // The path to the assets folder
    outputPath: string, // The path to the output folder
    serverOutputPath: string | null, // The path to the output folder
    templatePath: string, // The path to the output folder
    context: "client" | "isomorphic", // If client will not build server paths or add hydration logic to client bundle
    staticSrc: string, // Prefix,
    clientSideRouting: boolean,
    disableEventElements: boolean,
    buildTimings: boolean, // Whether to print timings of the static build
    run: boolean | "open", // Whether to run output after build
    deno: boolean
}

const defaultSettings: IPrismSettings = {
    minify: false,
    backendLanguage: "js",
    comments: false,
    projectPath: "./src",
    outputPath: "./out",
    disableEventElements: true,
    // These two are both null because they relate to project path and output path. There "defaults" are encoded in the respective actual getters in exported setters:
    assetPath: null,
    serverOutputPath: null,
    templatePath: join(__dirname, "bundle/template.html"),
    context: "isomorphic",
    staticSrc: "/",
    clientSideRouting: true,
    buildTimings: false,
    run: false,
    deno: false
};

/**
 * Adds some getters because projectPath and outputPath can be relative
 * Relative to cwd
 * @example if projectPath = "../abc" then absoluteProjectPath ~ "C:/abc"
 */
export interface IFinalPrismSettings extends IPrismSettings {
    absoluteProjectPath: string,
    absoluteOutputPath: string,
    absoluteAssetPath: string,
    absoluteServerOutputPath: string,
    absoluteTemplatePath: string,
}

/**
 * Mutates global `settings` through reading config file & command line arguments (process.argv)
 * TODO remove impure global settings
 * @returns
 */
export function registerSettings(): IFinalPrismSettings {
    const settings: IFinalPrismSettings = {
        ...defaultSettings,
        get absoluteProjectPath() {
            if (isAbsolute(this.projectPath)) {
                return this.projectPath;
            }
            return join(process.cwd(), this.projectPath);
        },
        get absoluteOutputPath() {
            if (isAbsolute(this.outputPath)) {
                return this.outputPath;
            }
            return join(process.cwd(), this.outputPath);
        },
        get actualAssetPath() {
            return this.assetPath ?? join(this.projectPath, "assets");
        },
        get absoluteAssetPath() {
            if (isAbsolute(this.actualAssetPath)) {
                return this.actualAssetPath;
            }
            return join(process.cwd(), this.actualAssetPath);
        },
        get actualServerOutputPath() {
            return this.serverOutputPath ?? join(this.outputPath, "server");
        },
        get absoluteServerOutputPath() {
            if (isAbsolute(this.actualServerOutputPath)) {
                return this.actualServerOutputPath;
            }
            return join(process.cwd(), this.actualServerOutputPath);
        },
        get absoluteTemplatePath() {
            if (isAbsolute(this.templatePath)) {
                return this.templatePath;
            }
            return join(process.cwd(), this.templatePath);
        },
    };

    let configFilePath: string, componentFile: string | null;
    let startIndex = 3;
    if (process.argv[startIndex]?.endsWith("prism.config.json")) {
        if (isAbsolute(process.argv[startIndex])) {
            configFilePath = process.argv[startIndex];
        } else {
            configFilePath = join(process.cwd(), process.argv[startIndex]);
        }
        startIndex++;
    } else {
        configFilePath = join(process.cwd(), "prism.config.json");
    }
    
    if (existsSync(join(configFilePath))) {
        const configFile = readFileSync(configFilePath).toString();
        Object.assign(settings, JSON.parse(configFile));
    }

    const args = process.argv.slice(startIndex);
    
    for (const [argument, value] of getArguments(args)) {
        if (value === null) {
            Reflect.set(settings, argument, true);
        } else {
            Reflect.set(settings, argument, value);
        }
    }

    return settings;
}