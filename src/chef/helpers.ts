import { relative, dirname } from "path";

export interface IPosition {
    file?: string,
    column: number,
    line: number
}

/** Matches [0-9] */
export function characterIsNumber(char: string) {
    const charCode = char.charCodeAt(0);
    return 48 <= charCode && charCode <= 57;
}

/**
 * These are settings for rendering out js which are constant throughout the project
 */
export interface IRenderSettings {
    minify: boolean,
    indent: number,
    scriptLanguage: ScriptLanguages,
    columnWidth: number,
    moduleFormat: ModuleFormat,
    includeExtensionsInImports: boolean,
    comments: boolean | "docstring" | "info",
}

export interface IParseSettings {
    comments: boolean
}

export enum ModuleFormat {
    ESM = "esm",
    CJS = "cjs"
}

export enum ScriptLanguages {
    Javascript, Typescript, Rust
}

/**
 * These are settings for rendering out js which are dependant on the context of rendering
 */
export interface IRenderOptions {
    inline: boolean
}

export const defaultRenderSettings = Object.freeze<IRenderSettings>({
    scriptLanguage: ScriptLanguages.Javascript,
    minify: false,
    indent: 4,
    columnWidth: 80,
    moduleFormat: ModuleFormat.ESM,
    includeExtensionsInImports: false,
    comments: true,
});

export const defaultParseSettings = Object.freeze<IParseSettings>({
    comments: true
});

export function makeRenderSettings(partialSettings: Partial<IRenderSettings>): IRenderSettings {
    return { ...defaultRenderSettings, ...partialSettings };
}

export interface IRenderable {
    render(settings?: Partial<IRenderSettings>, options?: Partial<IRenderOptions>): string;
}

/**
 * Represents a token
 * @typedef TokenType an enum represents tokens
 */
export interface Token<TokenType> {
    type: TokenType,
    value?: string,
    line: number,
    column: number,
}

export interface ITokenReaderSettings<TokenType> {
    reverse: Map<TokenType, string>,
    tokenLengths?: Map<TokenType, number>,
    combinations?: TokenReaderCombineMap<TokenType>,
    file?: string | null, // The filename
}

export interface ITokenizationSettings {
    file?: string | null,
    lineOffset?: number,
    columnOffset?: number,
}

type TokenReaderCombineMap<TokenType> = Map<TokenType, Array<[Array<TokenType>, TokenType]>>;

/**
 * Creates a combination map suitable for a token reader.
 * Mainly used to produce the structure the token reader uses once. 
 * @param collapse [[token1, token2, ...], finalToken]
 */
export function createCombineMap<TokenType>(
    collapse: Array<[Array<TokenType>, TokenType]>
): TokenReaderCombineMap<TokenType> {
    const combinationMap: TokenReaderCombineMap<TokenType> = new Map();
    for (const [tokens, resolve] of collapse) {
        const lastChar = tokens[tokens.length - 1];
        if (combinationMap.has(lastChar)) {
            combinationMap.get(lastChar)!.push([tokens, resolve]);
        } else {
            combinationMap.set(lastChar, [[tokens, resolve]]);
        }
    }
    return combinationMap;
}

/**
 * A token reader and handler
 * @typedef TokenType the token type to read
 */
export class TokenReader<TokenType> {
    filename: string | null;

    private _tokens: Array<Token<TokenType>> = [];
    private _readHead = 0;
    private _reverse: Map<TokenType, string>;
    private _lengths?: Map<TokenType, number>; // Only necessary if a combination map has primitive token with a length greater than 1

    private _combine: Map<TokenType, Array<[TokenType[], TokenType]>>; // Maps a token which is the start of a sequence to a array of map of a sequence to a final token

    // Used for assuring combining tokens happen if they are immediate
    private _lastInsertPoint: number = 0;

    /**
     * @param collapse A map of a sequence of tokens to a respective "grouped" token e.g assign + greater than is collapsed to arrow function
     * @param file A associate file from where the tokens originated (optional)
     * @param reverse Token reader settings
     */
    constructor(settings: ITokenReaderSettings<TokenType>) {
        if (settings.combinations) this._combine = this._combine = settings.combinations;
        if (settings.file) this.filename = settings.file;
        if (settings.tokenLengths) this._lengths = settings.tokenLengths;
        this._reverse = settings.reverse;
    }

    /** Adds a new token. Method checks top of array to see if there is a combined token */
    add(token: Token<TokenType>) {
        this._tokens.push(token);

        // Combination of tokens
        // Check whether there is a combination map associated under the reader, that the token being inserted may 
        // lead to a combination AND that the position the token is being inserted to is 
        // immediately after the previous (e.g no white space)
        if (this._combine) {
            if (
                this._combine.has(token.type)
                && token.column === this._lastInsertPoint
            ) {
                combinations:
                for (const [set, final] of this._combine.get(token.type)!) {
                    // Look backwards through the combination matching the end of the array up with set (the sequence of tokens taken to produce the final token)
                    for (let i = 0; i < set.length; i++) {
                        const match = this._tokens[this._tokens.length - set.length + i];
                        if (match === undefined || match.type !== set[i])
                            continue combinations;
                    }
                    let leftMostPosition: number;
                    // Remove the original tokens
                    for (let i = 0; i < set.length; i++) {
                        leftMostPosition = this._tokens.pop()!.column;
                    }
                    // Add the new combined token
                    this._tokens.push({ type: final, column: leftMostPosition!, line: token.line });
                }
            }

            // Last insert point is to make sure combination only happens when the next token is incident with the 
            // previous. As the column points to the start of the token the length must be used to found the column 
            // at the end of the token
            this._lastInsertPoint = token.column + (token.value?.length ?? this._lengths?.get(token.type) ?? 1);
        }

    }

    /** Removes last token from top */
    pop() {
        this._tokens.pop();
    }

    /** 
     * Returns the upcoming token without moving  
     * @param offset how far to peek
     */
    peek(offset = 1): Token<TokenType> | undefined {
        return this._tokens[this._readHead + offset];
    }

    /** Returns what is on the top 
     * @example num = 2 returns to the 3rd to last token from the top
    */
    peekFromTop(num = 0): Token<TokenType> {
        return this._tokens[this._tokens.length - num - 1];
    }

    /** Advances head and returns new token. TODO is this used? */
    next(): Token<TokenType> {
        return this._tokens[++this._readHead];
    }

    /**
     * Moves the read head forward
     * @param offset the number to move (defaults to 1)
     */
    move(offset = 1): void {
        this._readHead += offset;
    }

    /**
     * Used to assert the current token matches something the parser expects
     * @param toMatch the token type the current token has to match
     */
    expect(toMatch: TokenType) {
        if (this.current.type !== toMatch) {
            this.throwExpect(`Expected "${this._reverse.get(toMatch)}"`);
        }
    }

    /**
     * Throws a expect error. If in file will append filename and position of error
     * @param message Message saying what it parser was expecting
     */
    throwExpect(message: string, top = false): never {
        const current = top ? this.top : this.current;
        message += ` received "${this._reverse.get(current.type)}"`;
        if (this.filename) {
            message += ` at ${this.filename}:${current.line}:${current.column}`;
        }
        throw new ParseError(message);
    }

    /**
     * Throws a parse error. If reader has associated file will append that to error message
     * @param message 
     */
    throwError(message: string = "Error"): never {
        if (this.filename) {
            message += ` in ${this.filename}:${this.current.line}:${this.current.type}`;
        }
        throw new ParseError(message);
    }

    /**
        runs this.expect(tokenType) on the current token and proceeds one step
        TODO better name
        @param toMatch the token type the current token has to match
    */
    expectNext(toMatch: TokenType) {
        this.expect(toMatch);
        this.move();
    }

    /** 
     * Given a function this function runs through the token list and returns the token after the callback returns true. Does not move the actual read head. Used for looking ahead. TODO see object literal parsing.
     * STARTS AT CURRENT TOKEN
     * @returns the token type at which `cb` returns true and the distance from the current position
     * @param next a boolean to represent to return the token type ON the `cb` returning true or the next token
     */
    run(cb: (token: TokenType) => boolean, next: boolean = false): [TokenType, number] {
        let iter = 0;
        // Start at the current and go until callback returns true
        for (let i = this._readHead; i < this.length; i++) {
            const result = cb.call(undefined, this._tokens[i].type);
            iter++;
            if (result) {
                return [this._tokens[next ? i + 1 : i].type, iter];
            }
        }
        throw Error(`TokenReader.run ran function without finding`)
    }

    /**
     * Debugging function to print tokens
     */
    printTable() {
        console.table(this._tokens.map(token => ({ ...token, typeName: this._reverse.get(token.type) })))
    }

    /**
     * Returns the number of tokens in the reader
     */
    get length() {
        return this._tokens.length;
    }

    /**
     * Returns the current token
     */
    get current() {
        return this._tokens[this._readHead];
    }

    /**
     * Returns the top token. Used during tokenization
     */
    get top() {
        return this._tokens[this._tokens.length - 1];
    }
}

export class ParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ParseError";
    }
}

/**
 * Given the `importer` file wants to reference the `importee` file. It creates the path it would use to import it
 */
export function getImportPath(importer: string, importee: string) {
    let importPath = relative(
        dirname(importer.replace(/\\/g, "/")),
        importee.replace(/\\/g, "/")
    );
    if (importPath[0] !== ".") {
        importPath = "./" + importPath;
    }
    return importPath.replace(/\\/g, "/");
}