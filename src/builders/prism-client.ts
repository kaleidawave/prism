import { settings } from "../settings"
import { Module } from "../chef/javascript/components/module";
import { join } from "path";
import { ImportStatement } from "../chef/javascript/components/statements/import-export";
import { buildRouter } from "./client-side-routing";

const clientLibraries = [
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

export const importPrismClient = new ImportStatement(
    Array.from(clientExports.values()).flat(),
    `${settings.staticSrc}prism.js`
);

/**
 * Returns the whole Prism client as a module.
 * @param clientSideRouting Include the client router module (including injecting routes)
 */
export function getPrismClient(clientSideRouting: boolean = true): Module {
    const bundle = new Module();
    bundle.filename = `prism.js`;
    for (const clientLib of clientLibraries) {
        let module: Module;
        if (clientLib === "router.ts") {
            if (!clientSideRouting) continue;
            module = buildRouter();
        } else {
            module = Module.fromFile(join(__dirname, "../bundle", clientLib));
        }
        bundle.combine(module);
    }
    return bundle;
}