import { registerSettings, compileApplication, compileSingleComponent, runApplication } from "./node";
import { printHelpScreen, printInfoScreen, printWarningBanner } from "./others/banners";
import { createPrismTemplateApp } from "./others/actions";

switch (process.argv[2]) {
    case "version":
    case "info":
        printInfoScreen();
        break;
    case "help":
        printHelpScreen();
        break;
    case "init":
        createPrismTemplateApp(process.cwd());
        break;
    case "compile-component": {
        const settings = registerSettings(process.cwd());
        printWarningBanner();
        if (settings.buildTimings) console.time("Building single component");
        let componentTagName = compileSingleComponent(process.cwd(), settings);
        if (settings.buildTimings) console.timeEnd("Building single component");
        console.log(`Wrote out component.js and component.css to ${settings.outputPath}`);
        console.log(`Built web component, use with "<${componentTagName}></${componentTagName}>" or "document.createElement("${componentTagName}")"`);
        break;
    }
    case "compile-application":
    case "compile-app": {
        const settings = registerSettings(process.cwd());
        printWarningBanner();
        if (settings.buildTimings) console.time("Building application");
        compileApplication(process.cwd(), settings, runApplication)
        if (settings.buildTimings) console.timeEnd("Building application");
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