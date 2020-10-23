import { IRenderSettings } from "./helpers";

export interface IFile {
    filename: string;
    writeToFile(settings: Partial<IRenderSettings>): void;
}

/**
 * Given a filename returns the result 
 */
export type fsReadCallback = (filename: string) => string | Promise<string>;

let __fileSystemReadCallback: fsReadCallback | null = null;
export function registerFSReadCallback(cb: fsReadCallback) {
    __fileSystemReadCallback = cb;
}

export type fsWriteCallback = (filename: string, content: string) => void;

let __fileSystemWriteCallback: fsWriteCallback | null = null;
export function registerFSWriteCallback(cb: fsWriteCallback) {
    __fileSystemWriteCallback = cb;
}

export type nodeReadFileSyncSignature =
    (path: string, options?: { encoding?: null; flag?: string; } | null) => Buffer;
let nodeReadFileSync: nodeReadFileSyncSignature | null;

/**
 * TODO if Deno
 * @param filename 
 */
export async function readFile(filename: string): Promise<string> {
    if (__fileSystemReadCallback) {
        return __fileSystemReadCallback(filename);
    } else {
        // @ts-ignore ts does not like window
        if (typeof window !== "undefined") {
            throw Error("Cannot read file without fs callback");
        } else {
            if (!nodeReadFileSync) {
                nodeReadFileSync = require("fs").readFileSync;
            }
            return nodeReadFileSync!(filename).toString();
}
    }
}

export type nodeWriteFileSyncSignature =
    (path: string, data: any, options?: { encoding?: null; flag?: string; } | null) => Buffer;
let nodeWriteFileSync: nodeWriteFileSyncSignature | null;

export function writeFile(filename: string, content: string): void {
    if (__fileSystemWriteCallback) {
        __fileSystemWriteCallback(filename, content);
    } else {
        // @ts-ignore ts does not like window
        if (typeof window !== "undefined") {
            throw Error("Cannot write file without fs callback");
        } else {
            if (!nodeWriteFileSync) {
                nodeWriteFileSync = require("fs").writeFileSync;
            }
            nodeWriteFileSync!(filename, content);
        }
    }
}