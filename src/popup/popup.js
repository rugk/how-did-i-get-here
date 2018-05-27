"use strict";

const TabHistory = (function () {
    const me = {};

    const faviconCache = new Map();

    /**
     * Searches through the favicon cache and returns it if one could be found.
     *
     * Returns an empty string in case of falure.
     *
     * @name   TabHistory.searchCacheForIcon
     * @function
     * @private
     * @param {Object} tab
     * @returns {string}
     */
    function searchCacheForIcon(tab) {
        const tabUrl = new URL(tab.url);
        if (faviconCache.has(tabUrl.host)) {
            return faviconCache.get(tabUrl.host);
        }

        return "";
    }

    /**
     * Saves the tab data in cache in case, it needs to be found later.
     *
     * @name   TabHistory.saveTabInCache
     * @function
     * @private
     * @param {Object} tab
     * @returns {void}
     */
    function saveTabInCache(tab) {
        const tabUrl = new URL(tab.url);
        if (!faviconCache.has(tabUrl.host)) {
            faviconCache.set(tabUrl.host, tab.favIconUrl);
        }
    }

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

        const parentTab = await browser.tabs.get(tab.openerTabId);

        if (!parentTab.favIconUrl) {
            parentTab.favIconUrl = searchCacheForIcon(parentTab);
        } else {
            saveTabInCache(parentTab);
        }

        return parentTab;
    };

    /**
     * Returns the whole history of the tab.
     *
     * @name   TabHistory.getCurrentTab
     * @function
     * @returns {Object}
     */
    me.getCurrentTab = async function() {
        const currentTabs = await browser.tabs.query({currentWindow: true, active: true});
        const currentTab = currentTabs[0];

        saveTabInCache(currentTab);
        return currentTab;
    };

    return me;
})();

const UserInterface = (function () {
    const me = {};

    const POPUP_RESIZE_ESTIMATED_TIME = 10; // ms

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
            elTab.getElementsByClassName("tabContent")[0].addEventListener("click", tabClick);
        }

        setTabProperties(tab, elTab);

        historyCount++;

        if (newlyCreated) {
            // save child as one for next tab
            elLastHistory = elLastHistory.appendChild(elTab);
        } else {
            elLastHistory = elTab;
        }

        // get next parent tab
        return TabHistory.getParentOfTab(tab).then(addHistoryElement);
    }

    /**
     * Update the sizes of popup and other elements to keep them consistent.
     *
     *  Even when the content changes, this ensures the popup is not constantly resized.
     *
     * @name   UserInterface.updateStaticSizes
     * @function
     * @private
     * @returns {void}
     */
    function updateStaticSizes() {
        // save old size as minimum popup size if needed
        if (!document.body.minHeight || document.body.clientHeight > parseInt(document.body.style.minHeight)) {
            document.body.style.minHeight = `${document.body.clientHeight}px`;
        }
        if (!document.body.minWidth || document.body.clientWidth > parseInt(document.body.style.minWidth)) {
            document.body.style.minWidth = `${document.body.clientWidth}px`;
        }

        document.querySelectorAll(".longInfoText").forEach((elLongInfo) => {
            // set size of long texts to static current size, so they don't increase the popup if shown later
            if (!elLongInfo.style.maxWidth || elLongInfo.style.clientWidth > parseInt(document.body.style.maxWidth) ) {
                elLongInfo.style.maxWidth = `${document.body.clientWidth}px`;
            }
        });
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

        updateStaticSizes();

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
            me.destroyTabList();
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
        const elTab = event.currentTarget.parentElement;

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
        // if we only navigate one thing back now, hide back button, because we don't need it anymore
        if (tabSwitches.length <= 2) {
            elBackButton.classList.add("invisible");
        }

        // remove current tab from stack
        tabSwitches.pop();

        // navigate to tab before (also popped, as it adds itself later anyway back)
        await switchToTab(tabSwitches.pop());
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
        const elTitle = elGroup.getElementsByClassName("title")[0];
        elTitle.textContent = tab.title;

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
        const elementChild = document.getElementById("tabhistory").firstElementChild;
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

            // find very long tab titles and add fade effect to them
            // needs some timeout, because while the popup is resizing it could have false positives
            setTimeout(() => {
                document.querySelectorAll(".title").forEach((elTitle) => {
                    if (elTitle.scrollWidth > elTitle.clientWidth) {
                        elTitle.classList.add("overflowFade");
                    } else {
                        elTitle.classList.remove("overflowFade");
                    }
                });
            }, POPUP_RESIZE_ESTIMATED_TIME);
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
