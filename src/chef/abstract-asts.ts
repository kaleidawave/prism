import { IFile } from "./filesystem";
import { IRenderable, IRenderOptions, IRenderSettings } from "./helpers";

export interface IModule extends IFile, IRenderable {
    statements: Array<any>;

    render(settings?: Partial<IRenderSettings>, options?: Partial<IRenderOptions>): string;

    writeToFile(settings?: Partial<IRenderSettings>): void;

    addExport(exportable: IFunctionDeclaration | any): void;
    addImport(importName: any, from: string): void;
}

export interface IFunctionDeclaration extends IRenderable {
    statements: Array<any>;

    buildArgumentListFromArgumentsMap(argumentMap: Map<string, any>): any;
    actualName: string | null;
}