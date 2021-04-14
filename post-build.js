const {readFileSync, writeFileSync} = require("fs");

// Cleans up and corrects packemon output
const packageJSON = JSON.parse(readFileSync("package.json"));
packageJSON.main = "./cjs/node.cjs";
packageJSON.files = packageJSON.files.filter(name => name !== "src/**/*.{ts,tsx,json}");
packageJSON.types = "./dts/node.d.ts";
writeFileSync("package.json", JSON.stringify(packageJSON, 0, 4));