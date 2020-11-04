import { createObservableObject } from "./observable";

/**
 * Adds reusable prism functionality on top of the base HTMLElement class
 */
export abstract class Component<T> extends HTMLElement {
    // The private cached (un-proxied) component data
    _data: Partial<T> = {};
    // Proxied data
    _dataProxy: Partial<T> = {};

    // Like isConnected but false until connectedCallback is finished
    _isRendered: boolean = false; 

    // Caches for element lookup
    // TODO new Map could be lazy
    _elemCache: Map<string, Element> = new Map();
    _ifSwapElemCache: Map<string, Element> = new Map();

    abstract layout: true | undefined; // Used by router to detect if SSR content is layout
    abstract _tree: T | undefined; // The primary observable

    // A callback for when triggered from a router where params are a set of URL params
    abstract load?: (params?: Object) => Promise<void>;

    // CSR component
    abstract render(): Generator<HTMLElement | string>;

    // Bindings 
    abstract bindEventListeners(): void;
    abstract unbindEventListeners(): void;

    // User defined lifecycle callbacks (which don't interfere with connectedCallback)
    abstract connected(): void | undefined;
    abstract disconnected(): void | undefined;

    // Used to retrieve elements inside the components DOM using a set class name by the Prism compiler
    // Also caches the element as to not call querySelector every time
    // Using query selector will work across csr and ssr component dom
    // TODO cache invalidation if element is not connected???
    getElem(id: string) {
        if (this._elemCache.has(id)) {
            return this._elemCache.get(id);
        } else {
            const elem = this.querySelector(`.${id}`);
            if (elem) this._elemCache.set(id, elem);
            return elem;
        }
    }

    // Used to manually update the cache
    setElem(id: string, elem: HTMLElement) {
        elem.classList.add(id);
        this._elemCache.set(id, elem);
    }
    
    // Returns reactivity state of the component. Deep changes will be reflected in the dom. Will only create observable once
    get data(): Partial<T> {
        if (!this._isRendered) {
            return this._data;
        }
        if (!this._tree) {
            // @ts-expect-error ._bindings does exist statically on derived class (abstract static)
            this._tree = createObservableObject.call(this, this.constructor._bindings, this._data, this._dataProxy)
        }
        return this._tree;
    }

    // Deeply assign values 
    set data(value) {
        if (this._isRendered) {
            Object.assign(this.data, value)
        } else {
            this._data = value
        }
    }

    connectedCallback() {
        // If component has been sever side rendered
        if (this.hasAttribute("data-ssr")) {
            this._data = {};
            this.bindEventListeners?.();
        } else {
            // Uses super to avoiding conflicting with a possible append override on the component 
            super.append(...this.render())
        }
        this.connected?.();
        this._isRendered = true;
    }

    disconnectedCallback() {
        this.disconnected?.();
        this.unbindEventListeners?.();
        this._isRendered = false;
    }
}