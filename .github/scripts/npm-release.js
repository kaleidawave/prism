const core = require('@actions/core');
const semver = require('semver');
const fs = require('fs');
const path = require("path");

try {
    const packageJSONFile = path.join(process.env.GITHUB_WORKSPACE, "package.json");
    const packageJSON = JSON.parse(fs.readFileSync(packageJSONFile).toString());
    const versionInput = process.argv[2] || core.getInput("version", {required: true});
    let version;
    switch (versionInput.toLowerCase()) {
        case "major":
        case "minor":
        case "patch":
            version = semver.inc(packageJSON.version, versionInput);
            break;
        default:
            const parsedVersion = semver.parse(versionInput);
            if (parsedVersion === null) {
                throw new Error(`Invalid version: "${versionInput}"`);
            } else {
                version = parsedVersion.version;
            }
            break;
    }
    packageJSON.version = version;
    fs.writeFileSync(packageJSONFile, JSON.stringify(packageJSON, 0, 4));
    core.info(`😎 Updated package.json version to ${version}`);
    core.setOutput("newVersion", version);
} catch (error) {
    core.setFailed(error.message);
}