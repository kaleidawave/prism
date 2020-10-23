import { IFile } from "./filesystem";
import { IConstruct, IRenderOptions, IRenderSettings } from "./helpers";

export abstract class AbstractModule<T> implements IFile, IConstruct {
    constructor(public filename: string, public statements: Array<T>) { }
    abstract render(settings?: Partial<IRenderSettings>, options?: Partial<IRenderOptions>): string;

    abstract writeToFile(settings?: Partial<IRenderSettings>): void;

    abstract addExport(exportable: AbstractFunctionDeclaration | any): void;
    abstract addImport(importName: any, from: string): void;
}

export abstract class AbstractFunctionDeclaration {
    statements: Array<any>;

    abstract buildArgumentListFromArgumentsMap(argumentMap: Map<string, any>): any;
    abstract actualName: string | null;
}