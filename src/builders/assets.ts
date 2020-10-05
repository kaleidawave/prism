import { copyFileSync, existsSync, mkdirSync } from "fs";
import { relative, resolve, dirname } from "path";
import { filesInFolder } from "../helpers";
import { Module } from "../chef/javascript/components/module";
import { Stylesheet } from "../chef/css/stylesheet";

/**
 * Moves assets from one folder to output folder
 * @param assetsFolder 
 * @param outputFolder 
 * @returns Array of module and stylesheets found in /scripts or /styles folder
 */
export function moveStaticAssets(assetsFolder: string, outputFolder: string): Array<Module | Stylesheet> {
    const modulesAndStylesheets: Array<Module | Stylesheet> = [];

    for (const file of filesInFolder(assetsFolder)) {
        const folder = dirname(relative(assetsFolder, file));
        if (folder.startsWith("styles")) {
            modulesAndStylesheets.push(Stylesheet.fromFile(file));
            continue;
        } else if (folder.startsWith("scripts")) {
            modulesAndStylesheets.push(Module.fromFile(file));
            continue;
        }
        
        const relativePath = relative(assetsFolder, file);
        const outputPath = resolve(outputFolder, relativePath);

        // If directory does not exist create it
        const dir = dirname(outputPath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        copyFileSync(file, outputPath);
    }
    return modulesAndStylesheets;
}