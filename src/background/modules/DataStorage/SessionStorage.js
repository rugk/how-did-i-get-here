// based on https://stackoverflow.com/a/42800150
export class SessionStorage extends Map {
    /**
     * Saves a value in the storage.
     *
     * @function
     * @param {string|int} id
     * @param {Object} value
     * @returns {boolean}
     */
    set(id, value) {
        if (typeof value === "object") {
            value = JSON.stringify(value);
        }
        sessionStorage.setItem(id, value);
    }

    /**
     * Returns whether the ID is stored.
     *
     * Note that if value "null" is stored, this also returns "false".
     *
     * @function
     * @param {string|int} id
     * @returns {boolean}
     */
    has(id) {
        return this.get(id) !== null;
    }

    /**
     * Deletes the item with the corresponding ID.
     *
     * @function
     * @param {string|int} id
     * @returns {Object|null}
     */
    delete(id) {
        return sessionStorage.removeItem(id);
    }

    /**
     * Clears *whole* local storage.
     *
     * @function
     * @returns {void}
     */
    clear() {
        return sessionStorage.clear();
    }

    /**
     * Returns the element to look for or returns null.
     *
     * @function
     * @param {string|int} id
     * @returns {Object|null}
     */
    get(id) {
        let value;

        try {
            try {
                value = sessionStorage.getItem(id);
            } catch (e) {
                // if local storage cannot be read, return null
                return null;
            }

            return JSON.parse(value);
        } catch (e) {
            return value;
        }
    }
}
