import { filesInFolder } from "../helpers";
import { Module } from "../chef/javascript/components/module";
import { Stylesheet } from "../chef/css/stylesheet";
import { IRenderSettings } from "../chef/helpers";
import { copyFile, relative, resolve, dirname } from "../filesystem";

const styleFileExtensions = ["css", "scss"];
const scriptFileExtensions = ["js", "ts"];

/**
 * Moves assets from one folder to output folder
 * @param assetsFolder 
 * @param outputFolder 
 * @returns Array of module and stylesheets found in /scripts or /styles folder
 */
export function moveStaticAssets(
    assetsFolder: string, 
    outputFolder: string, 
    renderSettings: Partial<IRenderSettings>
): Array<Module | Stylesheet> {
    const modulesAndStylesheets: Array<Module | Stylesheet> = [];

    for (const file of filesInFolder(assetsFolder)) {
        let moduleOrStylesheet: Module | Stylesheet | null = null;
        const folder = dirname(relative(assetsFolder, file));
        if (styleFileExtensions.some(ext => file.endsWith(ext))) {
            const stylesheet = Stylesheet.fromFile(file);
            if (folder.startsWith("styles")) {
                modulesAndStylesheets.push(stylesheet);
                continue;
            } else {
                moduleOrStylesheet = stylesheet;
            }
        } else if (scriptFileExtensions.some(ext => file.endsWith(ext))) {
            const module = Module.fromFile(file);
            if (folder.startsWith("scripts")) {
                modulesAndStylesheets.push(module);
                continue;
            } else {
                moduleOrStylesheet = module;
            }
        }
            
        const relativePath = relative(assetsFolder, file);
        let outputPath = resolve(outputFolder, relativePath);

        if (moduleOrStylesheet) {
            if (outputPath.endsWith(".ts")) {
                outputPath = outputPath.substring(0, outputPath.length - 3) + ".js";
            } else if (outputFolder.endsWith(".scss")) {
                outputPath = outputPath.substring(0, outputPath.length - 5) + ".css";
            }
            moduleOrStylesheet.writeToFile(renderSettings, outputPath);
        } else {
            copyFile(file, outputPath);
        }
    }
    return modulesAndStylesheets;
}