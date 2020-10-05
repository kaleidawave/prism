import { readFileSync } from "fs";
import { join } from "path";

export function printWarningBanner(): void {
    const message = `Warning: Prism is an experimental, expect unexpected behavior to not be caught, not for use in production`;
    const leftOffset = Math.floor(Math.max(process.stdout.columns - message.length, 0) / 2);
    console.log("\n" + " ".repeat(leftOffset) + message + "\n");
}

export function printInfoScreen(): void {
    const packageJSON = JSON.parse(readFileSync(join(__dirname, "../../package.json")).toString());
    const version = packageJSON.version;
    const leftOffset = Math.floor(Math.max(process.stdout.columns - 76, 0) / 2);
    console.log(
        `${" ".repeat(leftOffset)} ______   ______     __     ______     __    __    
${" ".repeat(leftOffset)}/\\  == \\ /\\  == \\   /\\ \\   /\\  ___\\   /\\ "-./  \\    Prism Compiler
${" ".repeat(leftOffset)}\\ \\  _-/ \\ \\  __<   \\ \\ \\  \\ \\___  \\  \\ \\ \\-./\\ \\   ${version}
${" ".repeat(leftOffset)} \\ \\_\\    \\ \\_\\ \\_\\  \\ \\_\\  \\/\\_____\\  \\ \\_\\ \\ \\_\\  @kaleidawave
${" ".repeat(leftOffset)}  \\/_/     \\/_/ /_/   \\/_/   \\/_____/   \\/_/  \\/_/ 
`);
}

export function printHelpScreen(): void {
    console.log(`To compile application:
    
    prism compile-app

To compile single component:

    prism compile-component --projectPath "./path/to/component"

For complete documentation on templating syntax and configuration goto github.com/kaleidawave/prism`)
}