"use strict";

const TabHistory = (function () {
    const me = {};

    /**
     * Returns the historic parent of a tab.
     *
     * @name   TabHistory.getParentOfTab
     * @generator
     * @function
     * @param {Tab} tab
     * @returns {Promise}
     */
    me.getParentOfTab = async function(tab) {
        if (!tab.openerTabId) {
            return new Promise((resolve, reject) => {
                reject(new Error("no more parents found"));
            });
        }

        return await browser.tabs.get(tab.openerTabId);
    };

    /**
     * Returns the whole history of the tab.
     *
     * @name   TabHistory.getCurrentTab
     * @function
     * @returns {Object}
     */
    me.getCurrentTab = async function() {
        const currentTab = await browser.tabs.query({currentWindow: true, active: true});
        return currentTab[0];
    };

    return me;
})();

const UserInterface = (function () {
    const me = {};

    const elCurrentTab = document.getElementById("currentTab");
    const elTabTemplate = document.getElementById("tabtemplate");
    const elBackButton = document.getElementById("backButton");
    const elNoElementFound = document.getElementById("noElementFound");

    let historyCount;
    let elLastHistory;
    const tabSwitches = [];

    /**
     * Recursively goes through historic elements to add them to UI.
     *
     * @name   UserInterface.addHistoryElement
     * @function
     * @private
     * @param {Object} tab
     * @returns {Promise}
     */
    function addHistoryElement(tab) {
        // try to get existing element
        let elTab = document.querySelector(`[data-tab-id='${tab.id}']`);
        let newlyCreated = false;

        // create new element if needed
        if (!elTab) {
            newlyCreated = true;

            elTab = elTabTemplate.cloneNode(true);
            elTab.removeAttribute("id");

            // attach event listener
            elTab.addEventListener("click", tabClick);
        }

        setTabProperties(tab, elTab);

        historyCount++;

        if (newlyCreated) {
            // save child as one for next tab
            elLastHistory = elLastHistory.appendChild(elTab);
        } else {
            elLastHistory = elTab;

            // mark tab as new, if needed
            delete elTab.dataset.outdated;
            elTab.classList.remove("notHistory");
        }

        // get next parent tab
        return TabHistory.getParentOfTab(tab).then(addHistoryElement);
    }

    /**
     * Go back to last item.
     *
     * You only have to pass one parameter of the two.
     *
     * @name   UserInterface.goBack
     * @function
     * @private
     * @param {integer} tabId
     * @param {HtmlElement} elTab
     * @returns {Promise}
     */
    function switchToTab(tabId, elTab) {
        if (tabId != null && tabId !== undefined) {
            elTab = elTab || document.querySelector(`[data-tab-id='${tabId}']`);
        } else if (elTab != null && elTab !== undefined) {
            tabId = tabId || Number(elTab.dataset.tabId);
        } else {
            throw new Error("at least one parameter must be specified");
        }

        if (elTab) {
            const windowId = Number(elTab.dataset.windowId);

            browser.windows.update(
                windowId, {
                    focused: true
                }
            );
        }

        return browser.tabs.update(
            tabId,
            {
                active: true
            }
        ).then(() => {
            // "reload" whole UI
            Controller.run();
        });
    }

    /**
     * When one item of the tab list is clicked.
     *
     * @name   UserInterface.tabClick
     * @function
     * @private
     * @param {Event} event
     * @returns {void}
     */
    function tabClick(event) {
        const elTab = event.currentTarget;

        switchToTab(null, elTab).then(() => {
            // if it is the initial tab, show back button
            if (tabSwitches.length <= 1) {
                elBackButton.classList.remove("invisible");
            }
        });

        // only possible in Chrome currently
        // https://bugzilla.mozilla.org/show_bug.cgi?id=1464601
        // browser.tabs.highlight({
        //     tabs: tabId
        // });
    }

    /**
     * Go back to last tab.
     *
     * @name   UserInterface.goBack
     * @function
     * @private
     * @returns {void}
     */
    async function goBack() {
        // remove current tab from stack
        tabSwitches.pop();

        // navigate to tab before (also popped, as it adds itself later anyway back)
        await switchToTab(tabSwitches.pop());

        // if it is the initial tab, hide back button, because we don't need it anymore
        if (tabSwitches.length <= 2) {
            elBackButton.classList.add("invisible");
        }
    }

    /**
     * Adds the data from the tab to the UI.
     *
     * @name   UserInterface.setTabProperties
     * @function
     * @private
     * @param {Object} tab
     * @param {HtmlElement} elGroup the place where to add the element
     * @returns {void}
     */
    function setTabProperties(tab, elGroup) {
        elGroup.getElementsByClassName("title")[0].textContent = tab.title;

        // save ID of tab
        elGroup.dataset.tabId = tab.id;
        elGroup.dataset.windowId = tab.windowId;

        const elFavicon = elGroup.querySelector("img");
        if (tab.favIconUrl) {
            elFavicon.setAttribute("src", tab.favIconUrl);
        } else {
            elFavicon.classList.add("invisible");
        }

        if (tab.hidden) {
            elGroup.classList.add("hiddenTab");
        }
        if (tab.pinned) {
            elGroup.classList.add("pinnedTab");
        }
        if (tab.incognito) {
            elGroup.classList.add("privateTab");
        }
    }

    /**
     * Resets most UI elements.
     *
     * @name   UserInterface.resetUi
     * @function
     * @returns {void}
     */
    me.resetUi = function() {
        historyCount = 0;
        elLastHistory = document.getElementById("tabhistory");

        // mark old elements as outdated
        for (const elTab of document.querySelectorAll("#tabhistory .tabelement")) {
            elTab.dataset.outdated = 1;
        }

        elNoElementFound.classList.add("invisible");
    };

    /**
     * Destroys the current tab list.
     *
     * @name   UserInterface.destroyTabList
     * @function
     * @returns {void}
     */
    me.destroyTabList = function() {
        const elementChild = elLastHistory.firstElementChild;
        if (elLastHistory.firstElementChild) {
            elementChild.remove();
        }
    };

    /**
     * Creates the basic UI structure.
     *
     * @name   UserInterface.buildUi
     * @function
     * @returns {void}
     */
    me.buildUi = async function() {
        const currentTab = await TabHistory.getCurrentTab();
        setTabProperties(currentTab, elCurrentTab);

        // push tab to history "stack", so we can navigate back to it later
        tabSwitches.push(currentTab.id);

        TabHistory.getParentOfTab(currentTab).then(addHistoryElement).catch(() => {
            // at the end a failure is triggered, because it cannot find more parents
            if (historyCount === 0) {
                elNoElementFound.textContent = browser.i18n.getMessage("noHistoryFound");
                elNoElementFound.classList.remove("invisible");
            }

            // hide outdated elements as not belonging to current tab
            for (const elOutdatedTab of document.querySelectorAll(".tabelement[data-outdated='1']")) {
                delete elOutdatedTab.dataset.outdated;

                elOutdatedTab.classList.add("notHistory");
            }
        });
    };

    /**
     * Inits module.
     *
     * @name   UserInterface.init
     * @function
     * @returns {void}
     */
    me.init = function() {
        elBackButton.addEventListener("click", goBack);
    };

    return me;
})();

const Controller = (function () {
    const me = {};

    /**
     * Run the application.
     *
     * @name   Controller.run
     * @function
     * @returns {void}
     */
    me.run = function() {
        // reset values
        UserInterface.resetUi();
        // build UI
        UserInterface.buildUi();
    };

    return me;
})();

// init modules
UserInterface.init();
Controller.run();
