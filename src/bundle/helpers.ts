import type { Component } from "./component";

/**
 * Utility function for swapping elements, used under #if cssu (client side state updates)
 * TODO caching element before regenerating
 * @param predicate The evaluated 
 * @param id 
 * @param elementGenerator A function to generate the nodes. The element predicate value is aware of the value of the predicate. TODO could be sent value to not reevaluate
 */
export function conditionalSwap(this: Component<any>, predicate: boolean, id: string, elementGenerator: () => HTMLElement): void {
    const oldElem: Element = this.getElem(id);
    // Don't change the element if the value of the predicate hasn't changed
    if (!!predicate === oldElem.hasAttribute("data-else")) {
        // this._ifSwapElemCache.get(id) will always return the prev discarded (if it was generated)
        const newElem = this._ifSwapElemCache.get(id) ?? elementGenerator.call(this);
        this.setElem(id, newElem); // Manually update cache
        this._ifSwapElemCache.set(id, oldElem);
        oldElem.replaceWith(newElem); // Replace the element
    }
}

/**
 * Luckily CharacterData and Component have a assignable data property
 */
export function tryAssignData(elem: CharacterData | Component<any> | null, value: any) {
    if (elem) elem.data = value;
}

/**
 * Given a element, cut out old children and for each old one call its remove function to remove it from the DOM.
 * This is when called by observable arrays
 * @param parent
 * @param length The target length for the elem.children
 */
export function setLength(parent: HTMLElement | null, length: number) {
    if (parent) Array.from(parent.children).splice(length).forEach(elem => elem.remove());
}

export function isArrayHoley<T>(array: Array<T>): boolean {
    for (let i = 0; i < array.length; i++) {
        if (array[i] === undefined) return true;
    }
    return false;
}