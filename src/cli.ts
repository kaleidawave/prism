#!/usr/bin/env node

import { lstatSync, existsSync } from "fs";
import { registerSettings, compileApplication, compileSingleComponent, runApplication } from "./node";
import { printHelpScreen, printInfoScreen, printWarningBanner } from "./others/banners";

switch (process.argv[2]) {
    case "version":
    case "info":
        printInfoScreen();
        break;
    case "help":
        printHelpScreen();
        break;
    case "compile-component": {
        const settings = registerSettings(process.cwd());
        printWarningBanner();
        if (settings.buildTimings) console.time("Building single component");
        if (lstatSync(settings.absoluteProjectPath).isDirectory() || !settings.projectPath.endsWith(".prism")) {
            throw Error(`Compile Component: "projectPath" must be a path to ".prism" file`);
        }
        if (existsSync(settings.outputPath) && lstatSync(settings.outputPath).isFile()) {
            throw Error(`Output path must be a directory`);
        }
        compileSingleComponent(settings.projectPath, process.cwd(), settings)
            .then(() => {
                if (settings.buildTimings) console.timeEnd("Building single component");
            });
        break;
    }
    case "compile-application":
    case "compile-app": {
        const settings = registerSettings(process.cwd());
        printWarningBanner();
        if (settings.buildTimings) console.time("Building application");
        if (existsSync(settings.outputPath) && lstatSync(settings.outputPath).isFile()) {
            throw Error(`Output path must be a directory`);
        }
        compileApplication(settings, runApplication).then(() => {
            if (settings.buildTimings) console.timeEnd("Building application");
        });
        break;
    }
    // Others
    case "run": {
        const settings = registerSettings(process.cwd());
        const openBrowser = process.argv[3] === "--open";
        runApplication(openBrowser, settings);
        break;
    }
    default:
        console.error(`Unknown action ${process.argv[2]}. Run 'prism help' for a list of functions`)
        break;
}