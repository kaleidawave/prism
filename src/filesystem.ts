import { 
    fsReadCallback, fsWriteCallback, 
    registerFSReadCallback as chefRegisterFSReadCallback, 
    registerFSWriteCallback as chefRegisterFSWriteCallback
} from "./chef/filesystem";
import type { Stats } from "fs";

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