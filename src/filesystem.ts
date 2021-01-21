import { 
    fsReadCallback, fsWriteCallback, 
    registerFSReadCallback as chefRegisterFSReadCallback, 
    registerFSWriteCallback as chefRegisterFSWriteCallback
} from "./chef/filesystem";
import type { Stats } from "fs";

/** Registering FS callbacks */
let __fileSystemReadCallback: fsReadCallback | null = null;
export function registerFSReadCallback(cb: fsReadCallback) {
    __fileSystemReadCallback = cb;
    chefRegisterFSReadCallback(cb);
}

let __fileSystemWriteCallback: fsWriteCallback | null = null;
export function registerFSWriteCallback(cb: fsWriteCallback) {
    __fileSystemWriteCallback = cb;
    chefRegisterFSWriteCallback(cb);
}

type fsCopyCallback = (from: string, to: string) => void;
let __fileSystemCopyCallback: fsCopyCallback | null = null;
export function registerFSCopyCallback(cb: fsCopyCallback) {
    __fileSystemCopyCallback = cb;
}

type fsExistsCallback = (path: string) => boolean;
let __fileSystemExistsCallback: fsExistsCallback | null = null;
export function registerFSExistsCallback(cb: fsExistsCallback) {
    __fileSystemExistsCallback = cb;
}

type fsReadDirectoryCallback = (path: string) => Array<string>;
let __fileSystemReadDirectoryCallback: fsReadDirectoryCallback | null = null;
export function registerFSReadDirectoryCallback(cb: fsReadDirectoryCallback) {
    __fileSystemReadDirectoryCallback = cb;
}

type fsPathInfoCallback = (path: string) => Stats;
let __fileSystemPathInfoCallback: fsPathInfoCallback | null = null;
export function registerFSPathInfoCallback(cb: fsPathInfoCallback) {
    __fileSystemPathInfoCallback = cb;
}

/** FS access functions: */
export function copyFile(from: string, to: string) {
    if (!__fileSystemCopyCallback) throw Error("No file system copy file callback registered");
    return __fileSystemCopyCallback(from, to);
}

export function exists(path: string): boolean {
    if (!__fileSystemExistsCallback) throw Error("No file system exists callback registered");
    return __fileSystemExistsCallback(path);
}

export function readFile(filename: string): string {
    if (!__fileSystemReadCallback) throw Error("No file system read file callback registered");
    return __fileSystemReadCallback(filename);
}

export function readDirectory(filename: string): Array<string> {
    if (!__fileSystemReadDirectoryCallback) throw Error("No file system read directory callback registered");
    return __fileSystemReadDirectoryCallback(filename);
}

export function pathInformation(filename: string): Stats {
    if (!__fileSystemPathInfoCallback) throw Error("No file system read file callback registered");
    return __fileSystemPathInfoCallback(filename);
}

/** Path util functions: */
let __pathJoinFunction: (...paths: string[]) => string;
export function registerPathJoinFunction(cb: (...paths: string[]) => string) {
    __pathJoinFunction = cb;
}
let __pathResolveFunction: (...string: string[]) => string;
export function registerPathResolveFunction(cb: (...string: string[]) => string) {
    __pathResolveFunction = cb;
}
let __pathDirnameFunction: (path: string) => string;
export function registerPathDirnameFunction(cb: (...string: string[]) => string) {
    __pathDirnameFunction = cb;
}
let __pathRelativeFunction: (path1: string, path2: string) => string;
export function registerPathRelativeFunction(cb: (path1: string, path2: string) => string) {
    __pathRelativeFunction = cb;
}
let __pathIsAbsoluteFunction: (path: string) => boolean;
export function registerPathIsAbsoluteFunction(cb: (path: string) => boolean) {
    __pathIsAbsoluteFunction = cb;
}
let __pathBasenameFunction: (path: string, ext: string) => string;
export function registerPathBasenameFunction(cb: (path: string) => string) {
    __pathBasenameFunction = cb;
}
let __pathExtnameFunction: (path: string) => string;
export function registerPathExtnameFunction(cb: (path: string) => string) {
    __pathExtnameFunction = cb;
}
let __pathSplitter: string | null;
export function setPathSplitter(splitter: string) {
    __pathSplitter = splitter;
}

export function join(...string: string[]): string {
    if (!__pathJoinFunction) throw Error("No path join callback registered");
    return __pathJoinFunction(...string);
}

export function resolve(...string: string[]): string {
    if (!__pathResolveFunction) throw Error("No path resolve callback registered");
    return __pathResolveFunction(...string);
}

export function dirname(path: string): string {
    if (!__pathDirnameFunction) throw Error("No path dirname callback registered");
    return __pathDirnameFunction(path);
}

export function basename(path: string, extension: string): string {
    if (!__pathBasenameFunction) throw Error("No path basename callback registered");
    return __pathBasenameFunction(path, extension);
}

export function extname(path: string): string {
    if (!__pathExtnameFunction) throw Error("No path extname callback registered");
    return __pathExtnameFunction(path);
}

export function relative(path1: string, path2: string): string {
    if (!__pathRelativeFunction) throw Error("No path relative callback registered");
    return __pathRelativeFunction(path1, path2);
}

export function isAbsolute(path: string): boolean {
    if (!__pathIsAbsoluteFunction) throw Error("No path isAbsolute callback registered");
    return __pathIsAbsoluteFunction(path);
}

export function getPathSplitter(): string {
    if (__pathSplitter == null) throw Error("No path splitter registered");
    return __pathSplitter;
}