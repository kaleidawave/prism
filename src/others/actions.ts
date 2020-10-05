import { extname, isAbsolute, join } from "path";
import { Module } from "../chef/javascript/components/module";
import { Stylesheet } from "../chef/css/stylesheet";
import { HTMLDocument } from "../chef/html/html";

export function minifyFile(targetFile: string, outputFile: string) {
    const absTargetFile = isAbsolute(targetFile) ? targetFile : join(process.cwd(), targetFile);
    const absOutputFile = isAbsolute(outputFile) ? outputFile : join(process.cwd(), outputFile);
    const extension = extname(targetFile);
    switch (extension) {
        case ".js":
        case ".ts":
            Module.fromFile(absTargetFile).writeToFile({ minify: true }, absOutputFile);
            break;
        case ".css":
            Stylesheet.fromFile(absTargetFile).writeToFile({ minify: true }, absOutputFile);
            break;
        case ".html":
            HTMLDocument.fromFile(absTargetFile).writeToFile({ minify: true }, absOutputFile);
            break;
        default:
            throw Error(`Files with extension "${extension}"`)
    }
}