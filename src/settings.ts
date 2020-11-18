import { join, isAbsolute } from "path";

export interface IPrismSettings {
    minify: boolean, // Removes whitespace for space saving in output
    backendLanguage: "js" | "ts" | "rust", // The languages to output server templates in
    comments: boolean, // Leave comments in TODO comment levels
    projectPath: string, // The path to the components folder OR a single component
    assetPath: string | null, // The path to the assets folder
    outputPath: string, // The path to the output folder
    serverOutputPath: string | null, // The path to the output folder
    templatePath: string | null, // The path to the output folder, null if default
    context: "client" | "isomorphic", // If client will not build server paths or add hydration logic to client bundle
    staticSrc: string, // Prefix all routes, used if index is not under "/" 
    clientSideRouting: boolean, // Add router and do client side routing
    // Add disable attribute to the SSR markup of all events which is then removed once event has been added
    disableEventElements: boolean, 
    versioning: boolean, // Whether to version bundles (Insert a unique id into path)
    buildTimings: boolean, // Whether to print timings of the static build
    run: boolean | "open", // Whether to run output after build
    // Whether to SSR the content of components with shadow dom https://web.dev/declarative-shadow-dom/
    declarativeShadowDOM: boolean, 
    deno: boolean // Includes file extensions in imports
}

const defaultSettings: IPrismSettings = {
    minify: false,
    comments: false,
    declarativeShadowDOM: false,
    projectPath: "./src",
    outputPath: "./out",
    /* These two are both null because they relate to project path and output path. 
    There "defaults" are encoded in the respective actual getters in exported setters: */
    assetPath: null,
    serverOutputPath: null,
    templatePath: null,
    versioning: true,
    staticSrc: "/",
    backendLanguage: "js",
    context: "isomorphic",
    clientSideRouting: true,
    disableEventElements: true,
    run: false,
    buildTimings: false,
    deno: false
};

/**
 * Adds some getters because projectPath and outputPath can be relative
 * Relative to cwd
 * @example if projectPath = "../abc" then absoluteProjectPath ~ "C:/abc"
 */
export interface IFinalPrismSettings extends IPrismSettings {
    cwd: string,
    pathSplitter: string,
    absoluteProjectPath: string,
    absoluteOutputPath: string,
    absoluteAssetPath: string,
    absoluteServerOutputPath: string,
    absoluteTemplatePath: string | null,
}

export function makePrismSettings(
    cwd: string, 
    pathSplitter: string, 
    partialSettings: Partial<IPrismSettings> = {}
): IFinalPrismSettings {
    const projectPath = partialSettings.projectPath ?? defaultSettings.projectPath;
    const outputPath = partialSettings.outputPath ?? defaultSettings.outputPath;
    const assetPath = partialSettings.assetPath ?? join(projectPath, "assets");
    const serverOutputPath = partialSettings.serverOutputPath ?? join(outputPath, "server");
    const templatePath = partialSettings.templatePath ?? defaultSettings.templatePath;
    return {
        ...defaultSettings,
        ...partialSettings,
        cwd, pathSplitter,
        absoluteProjectPath: isAbsolute(projectPath) ? projectPath : join(cwd, projectPath),
        absoluteOutputPath: isAbsolute(outputPath) ? outputPath : join(cwd, outputPath),
        absoluteAssetPath: isAbsolute(assetPath) ? assetPath : join(cwd, assetPath),
        absoluteServerOutputPath: isAbsolute(serverOutputPath) ? serverOutputPath : join(cwd, serverOutputPath),
        absoluteTemplatePath: templatePath ? isAbsolute(templatePath) ? templatePath : join(cwd, templatePath) : null,
    };
}