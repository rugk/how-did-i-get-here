"use strict";

const TabHistory = (function () {
    const me = {};

    /**
     * Returns the history of a tab.
     *
     * @name   IconHandler.getHistoryOfTab
     * @function
     * @private
     * @param {Tab} tab
     * @returns {Object}
     */
    async function getHistoryOfTab(tab) {
        // TODO: make real yield function??
        UserInterface.addHistoryElement(tab);

        if (tab.openerTabId) {
            const parentTab = await browser.tabs.get(tab.openerTabId);
            return getHistoryOfTab(parentTab);
        } else {
            return tab;
        }
    }

    /**
     * Returns the whole history of the tab.
     *
     * @name   TabHistory.getHistoryOfCurrentTab
     * @function
     * @returns {array}
     */
    me.getHistoryOfCurrentTab = async function() {
        const currentTab = await browser.tabs.query({currentWindow: true, active: true});
        const tab = currentTab[0];
        console.log(tab);

        return getHistoryOfTab(tab);
    };

    return me;
})();

const UserInterface = (function () {
    const me = {};

    let elLastHistory = document.getElementById("tabhistory");

    me.addHistoryElement = function(tab) {
        const elTab = document.createElement("p");
        elTab.textContent = tab.title;

        // save child as one for next tab
        elLastHistory = elLastHistory.appendChild(elTab);
    };

    /**
     * Init icon module.
     *
     * @name   UserInterface.init
     * @function
     * @returns {void}
     */
    me.init = function() {
        TabHistory.getHistoryOfCurrentTab();
    };

    return me;
})();

// init modules
UserInterface.init();
