import { TokenReader, makeRenderSettings, ScriptLanguages, IRenderSettings, getImportPath } from "../../helpers";
import { JSToken, stringToTokens } from "../javascript";
import { Decorator, ClassDeclaration } from "./constructs/class";
import { StatementTypes, ParseStatement } from "./statements/statement";
import { ExportStatement, ImportStatement } from "./statements/import-export";
import { ValueTypes } from "./value/value";
import { VariableDeclaration } from "./statements/variable";
import { renderBlock } from "./constructs/block";
import { readFile, writeFile } from "../../filesystem";
import { IModule } from "../../abstract-asts";

export class Module implements IModule {

    name?: string;
    statements: Array<StatementTypes>;
    classes: Array<ClassDeclaration> = []; // TODO lazy
    imports: Array<ImportStatement> = []; // TODO lazy
    exports: Array<ExportStatement> = []; // TODO lazy

    // Registers a module to the cache
    static registerCachedModule(module: Module, underFilename?: string) {
        this.cachedModules.set(underFilename ?? module.filename!, module);
    }

    // Caches existing parsed modules
    // TODO rename filename does not change cache..?
    public static cachedModules: Map<string, Module> = new Map();

    constructor(
        public filename: string,
        statements: Array<StatementTypes> = [],
    ) {
        for (const statement of statements) {
            if (statement instanceof ImportStatement) this.imports.push(statement);
            else if (statement instanceof ExportStatement) {
                this.exports.push(statement);
                if (statement.exported instanceof ClassDeclaration) this.classes.push(statement.exported)
            }
            if (statement instanceof ClassDeclaration) this.classes.push(statement);
        }
        this.statements = statements;
    }

    static fromString(text: string, filename: string, columnOffset?: number, lineOffset?: number): Module {
        const reader = stringToTokens(text, {
            file: filename,
            columnOffset,
            lineOffset
        });

        const mod = Module.fromTokens(reader, filename);
        reader.expect(JSToken.EOF);
        return mod;
    }

    /**
     * Will return a module. Will cache modules and return modules if they exist in cache
     * @param filename absolute path to module
     */
    static async fromFile(filename: string): Promise<Module> {
        if (this.cachedModules.has(filename)) return this.cachedModules.get(filename)!;
        const string = await readFile(filename);
        const module = Module.fromString(string, filename);
        this.cachedModules.set(filename, module);
        return module;
    }

    static fromTokens(reader: TokenReader<JSToken>, filename: string): Module {
        const mod = new Module(filename);

        // Accumulate decorators for classes
        const decoratorAccumulator: Set<Decorator> = new Set();

        while (reader.current.type !== JSToken.EOF) {
            // Parse the statement
            const statement = ParseStatement(reader);

            if (statement instanceof Decorator) {
                decoratorAccumulator.add(statement);
                continue;
            } else if (statement instanceof ClassDeclaration) {
                // Set class decorators and clear accumulator
                statement.decorators = [...decoratorAccumulator];
                decoratorAccumulator.clear();
            }

            // If class add to Module.classes
            if (statement instanceof ClassDeclaration) {
                mod.classes.push(statement);
            } else if (statement instanceof ExportStatement && statement.exported instanceof ClassDeclaration) {
                mod.classes.push(statement.exported);
                statement.exported.decorators = [...decoratorAccumulator];
                decoratorAccumulator.clear();
            }

            // Add to imports
            if (statement instanceof ImportStatement) {
                mod.imports.push(statement);
            }
            // Add to exports TODO export value rather than statement
            if (statement instanceof ExportStatement) {
                mod.exports.push(statement);
            }

            mod.statements.push(statement);

            if (reader.current.type === JSToken.SemiColon) reader.move();
        }
        return mod;
    }

    render(settings: Partial<IRenderSettings> = {}): string {
        return renderBlock(this.statements, makeRenderSettings(settings), false);
    }

    /**
     * Write the module to file
     * @param filename Overwrite current module filename. TODO temp
     * @param settings Render settings
     */
    writeToFile(settings: Partial<IRenderSettings> = {}, filename?: string): void {
        const extension = settings.scriptLanguage === ScriptLanguages.Typescript ? ".ts" : ".js";
        let file = filename ?? this.filename!;
        if (!file.endsWith(extension)) {
            file += extension;
        }
        writeFile(file, this.render(settings));
    }

    /**
     * Combine 2 modules
     * TODO does not catching sources changing
     */
    combine(module2: Module) {
        if (!this.filename) throw Error("Current module has no filename");
        if (!module2.filename) throw Error("Imported module has no filename");

        // Resolve any cases of the modules import from each other (both ways) and remove those import statements
        const thisModuleToModule2 = getImportPath(this.filename, module2.filename);
        this.statements = this.statements.filter(statement => !(
            statement instanceof ImportStatement && thisModuleToModule2.startsWith(statement.from)
        ));
        const module2ToThisModule = getImportPath(module2.filename, this.filename);
        module2.statements = module2.statements.filter(statement => !(
            statement instanceof ImportStatement && module2ToThisModule.startsWith(statement.from)
        ));

        this.statements.push(...module2.statements);
    }

    /**
     * Helper method that adds value to the module exported members
     */
    addExport(exported: ValueTypes) {
        const exportStatement = new ExportStatement(exported);
        this.statements.push(exportStatement);
    }

    addImport(variable: VariableDeclaration | VariableDeclaration[], from: Module | string) {
        if (!this.filename) throw Error("To import module, current module must have filename");
        if (typeof from !== "string" && !from.filename) throw Error("To import module, from module must have filename");
        let targetModule: string;
        if (from instanceof Module) {
            if (!from.filename) throw Error("Imported module requires filename");
            // Get relative reference from this module to imported module
            targetModule = getImportPath(this.filename, from.filename);
        } else {
            targetModule = from;
        }

        const importStatement = new ImportStatement(variable, targetModule);
        this.statements.unshift(importStatement);
    }

    removeImportsAndExports(): void {
        for (let i = 0; i < this.statements.length; i++) {
            const statement = this.statements[i];
            if (statement instanceof ExportStatement) {
                this.statements[i] = statement.exported;
            } else if (statement instanceof ImportStatement) {
                this.statements.splice(i, 1);
                i--;
            }
        }
    }
}