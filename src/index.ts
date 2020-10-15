#!/usr/bin/env node

import { registerSettings } from "./settings";
import { lstatSync, existsSync } from "fs";
import { compileSingleComponent } from "./builders/single-component";
import { compileApplication, runApplication } from "./builders/build-app";
import { printHelpScreen, printInfoScreen, printWarningBanner } from "./others/banners";
import { minifyFile } from "./others/actions";
import { Stylesheet } from "./chef/css/stylesheet";
import { isAbsolute, join } from "path";

export const enum IPrismAction {
    version = "version",
    info = "info",
    compileComponent = "compile-component",
    compileApp = "compile-app",
    help = "help",
    // Non-standard
    run = "*run",
    clone = "*clone",
    minify = "*minify",
    compileNestedCSS = "*compile-nested-css",
}

const action: IPrismAction = process.argv[2] as IPrismAction || IPrismAction.help;

switch (action) {
    case IPrismAction.version:
    case IPrismAction.info:
        printInfoScreen();
        break;
    case IPrismAction.help:
        printHelpScreen();
        break;
    case IPrismAction.compileComponent: {
        const settings = registerSettings();
        printWarningBanner();
        if (settings.buildTimings) console.time("Building single component");
        if (lstatSync(settings.absoluteProjectPath).isDirectory() || !settings.projectPath.endsWith(".prism")) {
            throw Error(`Compile Component: "projectPath" must be a path to ".prism" file`);
        }
        if (existsSync(settings.outputPath) && lstatSync(settings.outputPath).isFile()) {
            throw Error(`Output path must be a directory`);
        }
        compileSingleComponent(settings.projectPath, settings);
        if (settings.buildTimings) console.timeEnd("Building single component");
        break;
    }
    case IPrismAction.compileApp: {
        const settings = registerSettings();
        printWarningBanner();
        if (settings.buildTimings) console.time("Building application");
        if (existsSync(settings.outputPath) && lstatSync(settings.outputPath).isFile()) {
            throw Error(`Output path must be a directory`);
        }
        compileApplication(settings);
        if (settings.buildTimings) console.timeEnd("Building application");
        break;
    }
    // Others
    case IPrismAction.run: {
        const settings = registerSettings();
        const openBrowser = process.argv[3] === "--open";
        runApplication(openBrowser, settings);
        break;
    }
    case IPrismAction.minify: {
        // TODO list space savings
        const [targetFile, outputFile] = process.argv.slice(3);
        minifyFile(targetFile, outputFile);
        break;
    }
    case IPrismAction.compileNestedCSS: {
        let [targetFile, outputFile] = process.argv.slice(3);
        // TODO should error be thrown if targetFile is not .scss or .ncss
        const minify = process.argv[5] === "--minify";
        if (!isAbsolute(targetFile)) targetFile = join(process.cwd(), targetFile);
        if (!isAbsolute(outputFile)) outputFile = join(process.cwd(), outputFile);
        const stylesheet = Stylesheet.fromFile(targetFile);
        stylesheet.writeToFile({ minify }, outputFile);
        break;
    }
    default:
        console.error(`Unknown action ${action}. Run 'prism help' for a list of functions`)
        break;
}