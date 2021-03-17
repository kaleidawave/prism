/** 
 * Run with ts-node
 * Generates src/bundled-files.ts by building a exported Map that maps filenames to the bundled files 
 */

import {readdirSync, readFileSync, writeFileSync} from "fs";
import {join} from "path";
import {Module} from "./src/chef/javascript/components/module";
import {Comment} from "./src/chef/javascript/components/statements/comments";
import {Expression, Operation, VariableReference} from "./src/chef/javascript/components/value/expression";
import {ArrayLiteral} from "./src/chef/javascript/components/value/array";
import {Value, Type} from "./src/chef/javascript/components/value/value";
import {VariableDeclaration} from "./src/chef/javascript/components/statements/variable";
import {ScriptLanguages} from "./src/chef/helpers";

const infoComment = new Comment("Automatically generated from inject-bundle.js", true);
const bundledFilesDotTS = new Module("", [infoComment]);

const filenameToFileContent: Array<[string, string]> = [];

for (const filename of readdirSync(join(process.cwd(), "src", "bundle"))) {
    const content = readFileSync(join(process.cwd(), "src", "bundle", filename)).toString();
    filenameToFileContent.push([filename, content]);
}

bundledFilesDotTS.addExport(new VariableDeclaration("fileBundle", {
    value: new Expression({
        operation: Operation.Initialize,
        lhs: new VariableReference("Map"),
        rhs: new ArrayLiteral(
            filenameToFileContent.map(([filename, content]) => new ArrayLiteral([
                new Value(Type.string, filename),
                new Value(Type.string, content)
            ]))
        )
    })
}));

const prismVersion = JSON.parse(readFileSync("package.json").toString()).version;

bundledFilesDotTS.addExport(new VariableDeclaration("prismVersion", {
    value: new Value(Type.string, prismVersion)
}));

writeFileSync(
    join(process.cwd(), "src", "bundled-files.ts"), 
    bundledFilesDotTS.render({scriptLanguage: ScriptLanguages.Typescript})
);
console.log("Built file bundle");