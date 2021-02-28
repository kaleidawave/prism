import { IRenderSettings } from "./helpers";

export interface IFile {
    filename: string;
    writeToFile(settings: Partial<IRenderSettings>): void;
}

/**
 * Given a filename returns the result 
 */
export type fsReadCallback = (filename: string) => string;

let __fileSystemReadCallback: fsReadCallback | null = null;
export function registerFSReadCallback(cb: fsReadCallback | null) {
    __fileSystemReadCallback = cb;
}

export type fsWriteCallback = (filename: string, content: string) => void;

let __fileSystemWriteCallback: fsWriteCallback | null = null;
export function registerFSWriteCallback(cb: fsWriteCallback | null) {
    __fileSystemWriteCallback = cb;
}

/**
 * TODO if Deno
 * @param filename 
 */
export function readFile(filename: string): string {
    if (__fileSystemReadCallback) {
        return __fileSystemReadCallback(filename);
    } else {
        throw Error("Cannot read file without fs callback");
    }
}

export function writeFile(filename: string, content: string): void {
    if (__fileSystemWriteCallback) {
        __fileSystemWriteCallback(filename, content);
    } else {
        throw Error("Cannot write file without fs callback");
    }
}