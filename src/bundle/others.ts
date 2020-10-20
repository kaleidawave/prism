/** Contains alternative runtime function implementations */

import { Component } from "./component";
import { oE } from "./render";

// Minified h render function + no svg support
function h(tn: string, a: Object | 0 = 0, e: Object | 0 = 0, ...c: Array<HTMLElement>): HTMLElement {
    const elem = document.createElement(tn);
    if (a) {
        oE(a, ([k, v]) => {
            // TODO temp, haven't figured the weird characteristics of IDL attributes and SVG
            if (k in elem) {
                elem[k] = v;
            } else {
                elem.setAttribute(k, v);
            }
        });
    }
    if (e) {
        oE(e, ([eN, h]) => {
            elem.addEventListener(eN, h);
        });
    }
    elem.append(...c);
    return elem;
}

function createObservableObject<T>(
    this: Component<T>,
    m: any,
    d: Partial<T>,
): T {
    return new Proxy(d, {
        // target, prop, receiver
        get: (t, p, r) => {
            // Work around for JSON.stringify thing
            if (p === "toJSON") {
                return JSON.stringify(
                    Object.assign(t,
                        Object.fromEntries(Object.keys(r).map(k => [k, r[k]]))))
            }
            // Get the respective (c)hunk on the mapping tree
            const c = m[p];
            if (!c) return;
            return t[p] ?? (t[p] = c.get?.call?.(this));
        },
        // target, prop, value, receiver
        set: (t, p, v) => {
            // Try call set handlers
            m[p].set?.call?.(this, v)
            return Reflect.set(t, p, v)
        },
        has(_, p) {
            return p in m;
        },
        ownKeys() {
            return Object.keys(m)
        },
        getOwnPropertyDescriptor() {
            return { configurable: true, enumerable: true, writable: true }
        }
    }) as T;
}

function connectedCallback() {
    super.append(...this.render())
    this.connected?.();
    this._isRendered = true;
}

function disconnectedCallback() {
    this.disconnected?.();
    this._isRendered = false;
}