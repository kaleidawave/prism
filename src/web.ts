import { registerFSReadCallback as prismRegisterFSReadCallback, } from "./filesystem";
import type { fsReadCallback } from "./chef/filesystem";
import { clientModuleFilenames } from "./builders/prism-client";
import { fileBundle } from "./bundled-files";

export function registerFSReadCallback(cb: fsReadCallback) {
    prismRegisterFSReadCallback(async (filename) => {
        // TODO do this logic in prism-client
        const bundleFileName = clientModuleFilenames.find(fn => filename.endsWith(fn))
        if (bundleFileName) {
            return fileBundle.get(bundleFileName)!
        }
        return cb(filename)
    });
}

export { registerFSWriteCallback } from "./filesystem";
export { compileSingleComponent } from "./builders/compile-component";