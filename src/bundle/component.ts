import { cOO } from "./observable";

/**
 * Adds reusable prism functionality on top of the base HTMLElement class
 */
export abstract class Component<T> extends HTMLElement {
    // The private cached (un-proxied) component data
    _d: Partial<T> = {};
    // Proxied data
    _dP: Partial<T> = {};

    // Like isConnected but false until connectedCallback is finished
    _isR: boolean = false;

    // Caches for element lookup
    // TODO new Map could be lazy
    _eC: Map<string, Element> = new Map();
    _ifEC: Map<string, Element> = new Map();

    abstract layout: true | undefined; // Used by router to detect if SSR content is layout
    abstract _t: T | undefined; // The primary observable

    // A callback for when triggered from a router where params are a set of URL params
    abstract load?: (params?: Object) => Promise<void>;

    // CSR component
    abstract render();

    // Add and remove event bindings, a = add
    abstract handleEvents(a: boolean): void;

    // User defined lifecycle callbacks (which don't interfere with connectedCallback)
    abstract connected(): void | undefined;
    abstract disconnected(): void | undefined;

    // Used to retrieve elements inside the components DOM using a set class name by the Prism compiler
    // Also caches the element as to not call querySelector every time
    // Using query selector will work across csr and ssr component dom
    // TODO cache invalidation if element is not connected???
    getElem(id: string) {
        if (this._eC.has(id)) {
            return this._eC.get(id);
        } else {
            const e = (this.shadowRoot ?? this).querySelector(`.${id}`);
            if (e) this._eC.set(id, e);
            return e;
        }
    }

    // Used to manually update the cache
    setElem(id: string, e: HTMLElement) {
        e.classList.add(id);
        this._eC.set(id, e);
    }

    // Returns reactivity state of the component. Deep changes will be reflected in the dom. Will only create observable once
    get data(): Partial<T> {
        if (!this._isR) {
            return this._d;
        }
        if (!this._t) {
            // @ts-expect-error ._bindings does exist statically on derived class (abstract static)
            this._t = cOO.call(this, this.constructor._bindings, this._d, this._dP)
        }
        return this._t;
    }

    // Deeply assign values 
    set data(value) {
        if (this._isR) {
            Object.assign(this.data, value)
        } else {
            this._d = value
        }
    }

    connectedCallback() {
        // If component has been sever side rendered
        if (this.hasAttribute("data-ssr")) {
            this._d = {};
            this.handleEvents?.(true);
        } else {
            this.render()
        }
        this.connected?.();
        this._isR = true;
    }

    disconnectedCallback() {
        this.disconnected?.();
        this.handleEvents?.(false);
        this._isR = false;
        this._eC.clear()
    }
}