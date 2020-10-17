import { join } from "path";

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

let nodeReadDirSync: ((path: string) => Array<string>) | null = null;
let nodeLStatSync: ((path: string) => { isDirectory: () => boolean }) | null = null;

/**
 * Recursively yields absolute file paths in a folder
 * @param folder 
 * @yields full filepath
 */
export function* filesInFolder(folder: string): Generator<string> {
    if (!nodeReadDirSync) nodeReadDirSync = require("fs").readdirSync;
    if (!nodeLStatSync) nodeLStatSync = require("fs").lstatSync;

    for (const member of nodeReadDirSync!(folder)) {
        const memberPath = join(folder, member);
        if (nodeLStatSync!(memberPath).isDirectory()) {
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

/**
 * Utility function for assigning data to objects without interfering their prototypes
 * @param map The `Map` or `WeakMap` 
 * @param obj The 
 * @param key 
 * @param value 
 */
export function assignToObjectMap<T extends Object, U extends Object>(
    map: Map<T, U> | WeakMap<T, U>,
    obj: T,
    key: keyof U,
    value: U[typeof key]
) {
    if (map.has(obj)) {
        Reflect.set(map.get(obj)!, key, value);
    } else {
        // @ts-ignore issue around partials
        map.set(obj, {[key]: value});
    }
}