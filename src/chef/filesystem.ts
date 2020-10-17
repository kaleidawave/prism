/**
 * Given a filename returns the result 
 */
export type fsReadCallback = (filename: string) => string;

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

export function readFile(filename: string): string {
    // @ts-ignore 
    if (typeof window !== "undefined") {
        if (!__fileSystemReadCallback) throw Error("Cannot get file without fs callback");
        return __fileSystemReadCallback(filename);
    } else {
        if (!nodeReadFileSync) {
            nodeReadFileSync = require("fs").readFileSync;
        }
        return nodeReadFileSync!(filename).toString();
    }
}

export type nodeWriteFileSyncSignature =
    (path: string, data: any, options?: { encoding?: null; flag?: string; } | null) => Buffer;
let nodeWriteFileSync: nodeWriteFileSyncSignature | null;

export function writeFile(filename: string, content: string): void {
    // @ts-ignore 
    if (typeof window !== "undefined") {
        if (!__fileSystemWriteCallback) throw Error("Cannot write file without fs callback");
        __fileSystemWriteCallback(filename, content);
    } else {
        if (!nodeWriteFileSync) {
            nodeWriteFileSync = require("fs").writeFileSync;
        }
        nodeWriteFileSync!(filename, content);
    }
}