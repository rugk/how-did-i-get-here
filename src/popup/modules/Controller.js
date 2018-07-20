import * as UserInterface from "./UserInterface.js";

/**
 * Run the application.
 *
 * @name   Controller.run
 * @function
 * @returns {void}
 */
export function run() {
    // reset values
    UserInterface.resetUi();
    // build UI
    UserInterface.buildUi();
}
