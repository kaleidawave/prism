import { IModule } from "../abstract-asts";
import { IRenderSettings, IRenderOptions, makeRenderSettings, defaultRenderSettings } from "../helpers";
import { renderStatements, Statements } from "./statements/block";

export class Module implements IModule {

    constructor(public filename: string, public statements: Array<Statements> = []) { }

    render(partialSettings: Partial<IRenderSettings> = defaultRenderSettings, options?: Partial<IRenderOptions>): string {
        const settings = makeRenderSettings(partialSettings);
        return renderStatements(this.statements, settings, false);
    }

    addExport(exportable: any) {
        throw new Error("Method not implemented.");
    }

    addImport(importName: any, from: string) {
        throw new Error("Method not implemented.");
    }

    writeToFile() {
        throw new Error("Method not implemented.");
    }
}