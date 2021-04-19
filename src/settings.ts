import { join, isAbsolute, sep as separator } from "path";

export interface IPrismSettings {
    minify: boolean, // Removes whitespace for space saving in output
    comments: boolean, // Leave comments in TODO comment levels
    componentPath: string | null, // The path to the entry component
    projectPath: string, // The path to the components folder
    assetPath: string | null, // The path to the assets folder
    outputPath: string, // The path to the output folder
    serverOutputPath: string | null, // The path to the output folder
    templatePath: string | null, // The path to the output folder, null if default
    context: "client" | "isomorphic", // If client will not build server paths or add hydration logic to client bundle
    backendLanguage: "js" | "ts" | "rust", // The languages to output server templates in
    buildTimings: boolean, // Whether to print timings of the static build
    relativeBasePath: string, // Prefix all routes, used if index is not under "/" 
    clientSideRouting: boolean, // Add router and do client side routing
    run: boolean | "open", // Whether to run output after build
    disableEventElements: boolean, // Add disable attribute to the SSR markup of all events which is then removed once event has been added
    versioning: boolean, // Whether to version bundles (Insert a unique id into path)
    // Whether to SSR the content of components with shadow dom https://web.dev/declarative-shadow-dom/
    declarativeShadowDOM: boolean,
    deno: boolean, // Includes file extensions in imports on server output
    bundleOutput: boolean, // Concatenate output to single bundle
    outputTypeScript: boolean, // Whether to output components in typescript so that checking can be done
    includeCSSImports: boolean, // Include CSS imports in components
}

const defaultSettings: IPrismSettings = {
    minify: false,
    comments: false,
    declarativeShadowDOM: false,
    componentPath: null,
    projectPath: "./views",
    assetPath: null,
    outputPath: "./out",
    serverOutputPath: null,
    templatePath: null,
    context: "isomorphic",
    backendLanguage: "js",
    buildTimings: false,
    clientSideRouting: true,
    versioning: true,
    relativeBasePath: "/",
    disableEventElements: true,
    run: false,
    deno: false,
    bundleOutput: true,
    includeCSSImports: false,
    outputTypeScript: false,
};

/**
 * Adds some getters because projectPath and outputPath can be relative
 * Relative to cwd
 * @example if projectPath = "../abc" then absoluteProjectPath ~ "C:/abc"
 */
export interface IFinalPrismSettings extends IPrismSettings {
    projectPath: string,
    absoluteComponentPath: string, // Entry component (TODO)
    pathSplitter: string, // Needed for rust things
    absoluteProjectPath: string,
    absoluteOutputPath: string,
    absoluteAssetPath: string,
    absoluteServerOutputPath: string,
    absoluteTemplatePath: string | null,
}

export function makePrismSettings(
    cwd: string,
    partialSettings: Partial<IPrismSettings> = {}
): IFinalPrismSettings {
    const projectPath = partialSettings.projectPath ?? defaultSettings.projectPath;
    const outputPath = partialSettings.outputPath ?? defaultSettings.outputPath;
    const assetPath = partialSettings.assetPath ?? join(projectPath, "assets");
    const serverOutputPath = partialSettings.serverOutputPath ?? join(outputPath, "server");
    const templatePath = partialSettings.templatePath ?? defaultSettings.templatePath;
    const componentPath = partialSettings.componentPath ?? join(cwd, "index.prism");
    return {
        ...defaultSettings,
        ...partialSettings,
        pathSplitter: separator,
        componentPath,
        absoluteComponentPath: isAbsolute(componentPath) ? componentPath : join(cwd, componentPath),
        absoluteProjectPath: isAbsolute(projectPath) ? projectPath : join(cwd, projectPath),
        absoluteOutputPath: isAbsolute(outputPath) ? outputPath : join(cwd, outputPath),
        absoluteAssetPath: isAbsolute(assetPath) ? assetPath : join(cwd, assetPath),
        absoluteServerOutputPath: isAbsolute(serverOutputPath) ? serverOutputPath : join(cwd, serverOutputPath),
        absoluteTemplatePath: templatePath ? isAbsolute(templatePath) ? templatePath : join(cwd, templatePath) : null,
    };
}