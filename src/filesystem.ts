/// <reference lib="dom"/>

import { 
    fsReadCallback, fsWriteCallback, 
    registerFSReadCallback as chefRegisterFSReadCallback, 
    registerFSWriteCallback as chefRegisterFSWriteCallback
} from "./chef/filesystem";

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

export async function readFile(filename: string): Promise<string> {
    if (!__fileSystemReadCallback) throw Error();
    return __fileSystemReadCallback(filename);
}