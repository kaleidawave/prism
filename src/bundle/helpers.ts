import type { Component } from "./component";

/**
 * Utility function for swapping elements, used under #if cssu (client side state updates)
 * @param p A expression which if evaluates to truthy will sw
 * @param id 
 * @param elementGenerator A function to generate the nodes. The element predicate value is aware of the value of the predicate. TODO could be sent value to not reevaluate
 */
export function conditionalSwap(this: Component<any>, p: boolean, id: string, elementGenerator: () => HTMLElement): void {
    // (o)ldElem
    const oE: Element = this.getElem(id);
    // Don't change the element if the value of the predicate hasn't changed
    if (!!p === oE.hasAttribute("data-else")) {
        // this._ifSwapElemCache.get(id) will always return the prev discarded (if it was generated)
        const nE = this._ifSwapElemCache.get(id) ?? elementGenerator.call(this);
        this.setElem(id, nE); // Manually update cache
        this._ifSwapElemCache.set(id, oE);
        oE.replaceWith(nE); // Replace the element
    }
}

/**
 * Assign to e if it exists
 * @param e Component instance or CharacterData to assign to
 * @param v Value to attempt to assign
 * @param p Property to assign to (defaults to "data")
 */
export function tryAssignData(e: CharacterData | Component<any> | null, v: any, p = "data") {
    if (e) Reflect.set(e, p, v);
}

/**
 * Given a element, cut out old children and for each old one call its remove function to remove it from the DOM.
 * This is when called by observable arrays
 * @param p Parent element (one with #for on)
 * @param l The target length for the parent.children
 */
export function setLength(p: HTMLElement | null, l: number) {
    if (p) Array.from(p.children).splice(l).forEach(e => e.remove());
}

/**
 * Returns true if array has holes / undefined elements
 * @example `isArrayHoley([,,1]) -> true`
 * @param a Array
 */
export function isArrayHoley<T>(a: Array<T>): boolean {
    for (let i = 0; i < a.length; i++) {
        if (a[i] === undefined) return true;
    }
    return false;
}