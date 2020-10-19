/** 
 * TODO requires a build of Chef to work yet Prism build relies on this...
 * Generates src/bundled-files.ts by building a exported Map that maps filenames to the bundled files 
 */

const {readdirSync, readFileSync} = require("fs");
const {join} = require("path");
const {Module} = require("./out/chef/javascript/components/module");
const {Comment} = require("./out/chef/javascript/components/statements/comments");
const {Expression, Operation} = require("./out/chef/javascript/components/value/expression");
const {VariableReference} = require("./out/chef/javascript/components/value/variable");
const {ArrayLiteral} = require("./out/chef/javascript/components/value/array");
const {Value, Type} = require("./out/chef/javascript/components/value/value");
const {VariableDeclaration} = require("./out/chef/javascript/components/statements/variable");
const {getSettings, ScriptLanguages} = require("./out/chef/helpers");

const infoComment = new Comment("Automatically generated from inject-bundle.js", true);
const bundledFilesDotTS = new Module([infoComment]);
bundledFilesDotTS.filename = join(process.cwd(), "src", "bundled-files.ts");

const filenameToFileContent = [];

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
                new Value(filename, Type.string),
                new Value(content, Type.string)
            ]))
        )
    })
}));

bundledFilesDotTS.writeToFile(getSettings({scriptLanguage: ScriptLanguages.Typescript}));