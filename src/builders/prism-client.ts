import { Module } from "../chef/javascript/components/module";
import { injectRoutes } from "./client-side-routing";
import { IRuntimeFeatures } from "./client-bundle";
import { readFile } from "../filesystem";
import { join } from "path";

export const clientModuleFilenames = [
    "component.ts",
    "helpers.ts",
    "observable.ts",
    "render.ts",
    "router.ts",
];

export const clientExports: Map<string, Array<string>> = new Map([
    ["component.ts", ["Component"]],
    ["helpers.ts", ["conditionalSwap", "setLength", "tryAssignToTextNode"]],
    ["render.ts", ["h", "createComment"]],
    ["router.ts", ["Router"]],
]);


/**
 * Returns the whole Prism client as a module.
 * @param clientSideRouting Include the client router module (including injecting routes)
 */
export async function getPrismClient(clientSideRouting: boolean = true): Promise<Module> {
    const bundle = new Module();
    bundle.filename = "prism.js";
    for (const clientLib of clientModuleFilenames) {
        const module = Module.fromString(await readFile(clientLib), join("bundle", clientLib));
        if (clientLib.endsWith("router.ts")) {
            if (!clientSideRouting) continue;
            injectRoutes(module);
        }
        bundle.combine(module);
    }
    return bundle;
}