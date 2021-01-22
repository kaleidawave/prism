export { registerFSReadCallback, registerFSCopyCallback, registerFSExistsCallback, registerFSWriteCallback } from "./filesystem";
export { compileSingleComponent } from "./builders/compile-component";
export { compileApplication } from "./builders/compile-app";
export { makePrismSettings } from "./settings";
import {
    registerPathBasenameFunction, registerPathDirnameFunction,
    registerPathExtnameFunction, registerPathIsAbsoluteFunction, 
    registerPathJoinFunction, registerPathRelativeFunction, 
    registerPathResolveFunction, setPathSplitter
} from "./filesystem";
import {basename, dirname, extname, isAbsolute, join, relative, resolve} from "https://unpkg.com/path-browserify@1.0.1/index.js";
registerPathBasenameFunction(basename);
registerPathDirnameFunction(dirname);
registerPathExtnameFunction(extname);
registerPathIsAbsoluteFunction(isAbsolute);
registerPathJoinFunction(join);
registerPathRelativeFunction(relative);
registerPathResolveFunction(resolve);
setPathSplitter("/");