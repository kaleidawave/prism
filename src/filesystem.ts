/// <reference lib="dom"/>

import { clientModuleFilenames } from "./builders/prism-client";
import { 
    fsReadCallback, fsWriteCallback, 
    nodeReadFileSyncSignature, nodeWriteFileSyncSignature, 
    registerFSReadCallback as chefRegisterFSReadCallback, 
    registerFSWriteCallback as chefRegisterFSWriteCallback
} from "./chef/filesystem";
import {join, dirname} from "path";

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

let nodeWriteFileSync: nodeWriteFileSyncSignature | null;
let nodeReadFileSync: nodeReadFileSyncSignature | null;

export async function readFile(filename: string): Promise<string> {
    if (typeof window !== "undefined") {
        const bundleFileName = clientModuleFilenames.find(fn => filename.endsWith(fn))
        if (bundleFileName) {
            // @ts-ignore ts doesn't like import.meta.url
            const response = await fetch(join(dirname(new URL(import.meta.url).pathname), "bundle", bundleFileName));
            return response.text();
        } else {
            if (!__fileSystemReadCallback) throw Error("No fs read callback registered");
            return __fileSystemReadCallback(filename);
        }
    } else {
        if (!nodeReadFileSync) nodeReadFileSync = require("fs").readFileSync;
        return nodeReadFileSync!(filename).toString();
    }
}