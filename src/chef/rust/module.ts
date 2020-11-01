import { IModule } from "../abstract-asts";
import { writeFile } from "../filesystem";
import { IRenderSettings, IRenderOptions, makeRenderSettings, defaultRenderSettings } from "../helpers";
import { renderStatements, StatementTypes } from "./statements/block";

export class Module implements IModule<StatementTypes> {

    constructor(public filename: string, public statements: Array<StatementTypes> = []) { }

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

    writeToFile(settings: Partial<IRenderSettings>) {
        writeFile(this.filename, this.render(settings));
    }
}