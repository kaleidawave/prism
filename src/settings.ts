import { join, isAbsolute, dirname } from "path";
import { readFile } from "./filesystem";
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

// @ts-ignore import.meta.url
const thisDirname = typeof __dirname !== "undefined" ? __dirname : dirname(import.meta.url)

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
    templatePath: join(thisDirname, "bundle/template.html"),
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

export function getSettings(cwd: string, partialSettings: Partial<IPrismSettings>): IFinalPrismSettings {
    return {
        ...defaultSettings,
        get absoluteProjectPath() {
            if (isAbsolute(this.projectPath)) {
                return this.projectPath;
            }
            return join(cwd, this.projectPath);
        },
        get absoluteOutputPath() {
            if (isAbsolute(this.outputPath)) {
                return this.outputPath;
            }
            return join(cwd, this.outputPath);
        },
        get actualAssetPath() {
            return this.assetPath ?? join(this.projectPath, "assets");
        },
        get absoluteAssetPath() {
            if (isAbsolute(this.actualAssetPath)) {
                return this.actualAssetPath;
            }
            return join(cwd, this.actualAssetPath);
        },
        get actualServerOutputPath() {
            return this.serverOutputPath ?? join(this.outputPath, "server");
        },
        get absoluteServerOutputPath() {
            if (isAbsolute(this.actualServerOutputPath)) {
                return this.actualServerOutputPath;
            }
            return join(cwd, this.actualServerOutputPath);
        },
        get absoluteTemplatePath() {
            if (isAbsolute(this.templatePath)) {
                return this.templatePath;
            }
            return join(cwd, this.templatePath);
        },
        ...partialSettings
    };
}

/**
 * NODE use only
 */
export function registerSettings(cwd: string): IFinalPrismSettings {
    let configFilePath: string, componentFile: string | null;
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
    
    if (require("fs").existsSync(join(configFilePath))) {
        Object.assign(settings, JSON.parse(readFile(configFilePath).toString()));
    }

    const args = process.argv.slice(startIndex);
    
    for (const [argument, value] of getArguments(args)) {
        if (value === null) {
            Reflect.set(settings, argument, true);
        } else {
            Reflect.set(settings, argument, value);
        }
    }

    return getSettings(cwd, settings);
}