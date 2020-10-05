import { existsSync, mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { EOL } from "os";

/**
 * Writes a file out, will create folders if folder does not exist.
 * @param overwrite if true and file exists will throw error 
 * @param log Will log out the file has been written
 */
export function writeFile(filepath: string, content: string | Buffer, overwrite = false, log = true) {
    if (existsSync(filepath) && !overwrite) {
        throw Error(`File: "${filepath}" already exists`);
    }
    const dir = dirname(filepath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filepath, content);
    if (log) {
        console.log(`Wrote out "${filepath}"`);
    }
}

/**
 * Parses command line arguments to map
 */
export function getArguments(args: string[]): Map<string, string> {
    const argsMap = new Map();
    let index = 0;
    while (index < args.length) {
        if (index + 1 >= args.length || args[index + 1].startsWith("--")) {
            argsMap.set(args[index].substring(2), null);
            index++;
        } else {
            let value: string | boolean | number = args[index + 1];
            if (value === "true") value = true;
            else if (value === "false") value = false;
            // @ts-ignore
            else if (!isNaN(value)) value = parseInt(value);
            argsMap.set(args[index].substring(2), value);
            index += 2;
        }
    }
    return argsMap;
}

export interface IMetadata {
    title?: string,
    description?: string,
    website?: string,
    image?: string
}

export function isUppercase(char: string): boolean {
    const charCode = char.charCodeAt(0);
    return charCode >= 65 && charCode <= 90
}

// Environment variables
export function readEnvironmentVariables(envFilePath: string): Map<string, string> {
    const environmentVariables = new Map<string, string>();

    const env = readFileSync(envFilePath).toString();

    for (const line of env.split(EOL)) {
        const [key, value] = line.split('=');
        environmentVariables.set(key.trim(), value.trim());
    }

    return environmentVariables;
}

/**
 * Recursively yields absolute file paths in a folder
 * @param folder 
 * @yields full filepath
 */
export function* filesInFolder(folder: string): Generator<string> {
    for (const member of readdirSync(folder)) {
        const memberPath = join(folder, member);
        if (lstatSync(memberPath).isDirectory()) {
            yield* filesInFolder(memberPath);
        } else {
            yield memberPath;
        }
    }
}

/**
 * like `arr.findIndex` but returns the rightmost index first. 
 * returns -1 if cannot find index that matches predicate (TODO temp)
 * @param arr 
 * @param predicate 
 */
export function findLastIndex<T>(arr: Array<T>, predicate: (arg0: T) => boolean): number {
    for (let i = arr.length - 1; i >= 0; i--) {
        if (predicate(arr[i])) return i;
    }
    return -1;
}