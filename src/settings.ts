import { join, isAbsolute } from "path";

export interface IPrismSettings {
    minify: boolean, // Removes whitespace for space saving in output
    backendLanguage: "js" | "ts", // The languages to output server templates in
    comments: boolean, // Leave comments in TODO comment levels
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

export const defaultTemplateHTML = "bundle/template.html";

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
    templatePath: defaultTemplateHTML,
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

export function makePrismSettings(cwd: string, partialSettings: Partial<IPrismSettings>): IFinalPrismSettings {
    return {
        ...defaultSettings,
        ...partialSettings,
        get absoluteProjectPath() {
            if (!this.projectPath) {
                this.projectPath = partialSettings.projectPath ?? defaultSettings.projectPath;
            }
            if (isAbsolute(this.projectPath)) {
                return this.projectPath;
            }
            return join(cwd, this.projectPath);
        },
        get absoluteOutputPath() {
            if (!this.outputPath) {
                this.outputPath = partialSettings.outputPath ?? defaultSettings.outputPath;
            }
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
            if (!this.templatePath) {
                this.templatePath = partialSettings.templatePath ?? defaultSettings.templatePath;
            }
            if (isAbsolute(this.templatePath) || this.templatePath === defaultTemplateHTML) {
                return this.templatePath;
            }
            return join(cwd, this.templatePath);
        },
    };
}