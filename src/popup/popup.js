"use strict";

const LastClosedTabs = (function () {
    const me = {};

    let gettingRecentlyClosed = null;
    let tabIdMap = null;

    /**
     * Return the recently closed data by the browser.
     *
     * @name   LastClosedTabs.getRecentlyClosed
     * @function
     * @private
     * @returns {Promise}
     */
    function getRecentlyClosed() {
        if (gettingRecentlyClosed === null) {
            gettingRecentlyClosed = browser.sessions.getRecentlyClosed();
        }

        return gettingRecentlyClosed;
    }

    /**
     * Return the recently closed tabs grouped by ID.
     *
     * @name   LastClosedTabs.getTabIdMap
     * @function
     * @private
     * @returns {Promise}
     */
    async function getTabIdMap() {
        // create map, if needed
        if (tabIdMap === null) {
            // fill map with elements
            tabIdMap = new Map();
            const recentlyClosed = await getRecentlyClosed();

            recentlyClosed.forEach((session) => {
                if (session.tab === undefined) {
                    return;
                }

                tabIdMap.set(session.tab.id, session);
            });
        }

        return tabIdMap;
    }

    /**
     * Returns the whole history of the tab.
     *
     * @name   LastClosedTabs.getTabSessionById
     * @function
     * @param {int} tabId
     * @returns {Promise} (Session variable)
     */
    me.getTabSessionById = async function(tabId) {
        const tabMap = await getTabIdMap();

        if (!tabMap.has(tabId)) {
            throw new Error("Tab ID not in list of recently closed tabs.");
        }

        return tabMap.get(tabId);
    };

    /**
     * Restores the specified tab by it's session object.
     *
     * @name   LastClosedTabs.restoreTab
     * @function
     * @param {Object} tabSession
     * @returns {Promise}
     */
    me.restoreTab = function(tabSession) {
        return browser.sessions.restore(tabSession.tab.sessionId);
    };

    return me;
})();


const TabHistory = (function () {
    const me = {};

    const COMMUNICATION_GET_TAB_DATA = "getTabData";

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
     * Returns [currentTabValues, historicTabValues]. The historic state of the
     * tab is the one, which is saved when the tab has been opened.
     * Note that the historic tab only saves a limited amount of data of the
     *  original tab URI.
     * The currentTab may also not be available, if the user already closed the tab.
     * In this case, only the historic values are available.
     * If the extension is newly installed, it _may_ also happen, that the historic
     * tab is not yet available.
     * (@TODO fix this!)
     *
     * In case a tab could not be found, an empty object is returned.
     *
     * @name   TabHistory.getParentOfTab
     * @generator
     * @function
     * @param {Tab} tab the current tab
     * @param {Tab} tabOld the current historic tab
     * @returns {Promise}
     * @throws {Error} if no more parents could be found
     */
    me.getParentOfTab = async function(tab, tabOld = {}) {
        let parentTab = {};
        let historicParentTab = {};

        // try to find historic parent tab if current tab exists
        if (tab.id) {
            // simply query tab data for existing tabs
            historicParentTab = await browser.sessions.getTabValue(tab.id, "parentTab").catch(() => {
                return undefined; // tab ID does not exist
                // (also returns undefined by definition if the tab value is not set)
            });
        }

        // if the current tab does not exist, we have to use the background cache
        if ((!historicParentTab || !historicParentTab.id) && tabOld.openerUniqueTabId) {
            // try to use tabOld.openerTabId to guess open tab in case it is still open
            const getExistingParent = browser.tabs.get(tabOld.openerTabId).catch(() => {
                return {};
            });

            // try to get value from background cache
            historicParentTab = await browser.runtime.sendMessage({
                type: COMMUNICATION_GET_TAB_DATA,
                uniqueTabId: tabOld.openerUniqueTabId
            });

            await getExistingParent.then((existingTab) => {
                if (!historicParentTab.id) {
                    return;
                }

                // if IDs are the same, we can be sure the tabs are actually
                // the same and the tab ID was not just randomly reused
                // Otherwise, we have unfortunately no way of knowing that.
                if (existingTab.id && historicParentTab.id === existingTab.id) {
                    parentTab = existingTab;
                }
            });
        }

        // if no parent could be found, throw exception
        if (!historicParentTab && !tab.openerTabId) {
            return new Promise((resolve, reject) => {
                reject(new Error("no more parents found"));
            });
        }

        if (historicParentTab) {
            if (!historicParentTab.favIconUrl) {
                historicParentTab.favIconUrl = searchCacheForIcon(historicParentTab);
            } else {
                saveTabInCache(historicParentTab);
            }
        }

        if (tab.openerTabId) {
            parentTab = await browser.tabs.get(tab.openerTabId);

            if (!parentTab.favIconUrl) {
                parentTab.favIconUrl = searchCacheForIcon(parentTab);
            } else {
                saveTabInCache(parentTab);
            }
        }

        return [parentTab, historicParentTab];
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

    const OVERFLOW_FADE_TIMEOUT = 100; // ms

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
     * @param {Array<Object,Object>} tabs
     * @returns {Promise}
     */
    function addHistoryElement(tabs) {
        const [currentTab, historicTab] = tabs;

        // create new element if needed
        const elTab = elTabTemplate.cloneNode(true);
        elTab.removeAttribute("id");

        // attach event listener
        elTab.getElementsByClassName("tabContent")[0].addEventListener("click", tabClick);

        setTabProperties(currentTab, historicTab, elTab);

        historyCount++;

        // save child as one for next tab
        elLastHistory = elLastHistory.appendChild(elTab);

        // get next parent tab
        return TabHistory.getParentOfTab(currentTab, historicTab).then(addHistoryElement);
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
     * Switches to a specific tab by it's ID and/or HtmlElement of the UI.
     *
     * You only have to pass one parameter of the two.
     *
     * @name   UserInterface.switchToTab
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

        if (elTab.dataset.isUnverifiedTab) {
            const tabId = Number(elTab.dataset.tabId);

            // try restore the likely closed tab
            LastClosedTabs.getTabSessionById(tabId).then((session) => {
                LastClosedTabs.restoreTab(session);
            }).catch(() => {
                console.log("clicked on (likely) not existant tab, ignore event");
            });

            return;
        }

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
     * @param {Object} currentTab
     * @param {Object} historicTab
     * @param {HtmlElement} elGroup the place where to add the element
     * @returns {void}
     */
    function setTabProperties(currentTab, historicTab, elGroup) {
        // get single object for values, but prefer one of the values
        const tabPreferHistoric = Object.assign({}, currentTab, historicTab);
        const tabPreferActive = Object.assign({}, historicTab, currentTab);

        const elTitle = elGroup.getElementsByClassName("title")[0];
        elTitle.textContent = tabPreferHistoric.title;

        // if no ID of current tab is available
        if (!currentTab.id || !currentTab.windowId) {
            // mark tab as unverified, so it is known it has to be searched or
            // restored (and the saved ID cannot be trusted)
            elGroup.dataset.isUnverifiedTab = true;
        }
        // save ID of tab
        elGroup.dataset.tabId = tabPreferActive.id;
        elGroup.dataset.windowId = tabPreferActive.windowId;

        // special handling if historic tab and current tab differ
        if (historicTab.url !== currentTab.url) {
            // mark it as requiring navigation back
            elGroup.classList.add("navigateBackTab");
        }

        const elFavicon = elGroup.querySelector("img");
        if (tabPreferHistoric.favIconUrl) {
            elFavicon.setAttribute("src", tabPreferHistoric.favIconUrl);
        }

        if (tabPreferActive.hidden) {
            elGroup.classList.add("hiddenTab");
        }
        if (tabPreferActive.pinned) {
            elGroup.classList.add("pinnedTab");
        }
        if (tabPreferActive.incognito) {
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
        // always use current value for this tab
        setTabProperties(currentTab, currentTab, elCurrentTab);

        // push tab to history "stack", so we can navigate back to it later
        tabSwitches.push(currentTab.id);

        TabHistory.getParentOfTab(currentTab).then(addHistoryElement).catch((error) => {
            // ignore expected failure
            if (error.message !== "no more parents found") {
                console.error(error); // eslint-disable-line no-console
            }

            // at the end a failure is triggered, because it cannot find more parents
            if (historyCount === 0) {
                elNoElementFound.textContent = browser.i18n.getMessage("noHistoryFound");
                elNoElementFound.classList.remove("invisible");
            }

            // find very long tab titles and add fade effect to them
            setTimeout(() => {
                document.querySelectorAll(".title").forEach((elTitle) => {
                    if (elTitle.scrollWidth > elTitle.clientWidth &&
                        elTitle.scrollWidth > document.body.clientWidth) {
                        elTitle.classList.add("overflowFade");
                    } else {
                        elTitle.classList.remove("overflowFade");
                    }
                });
            }, OVERFLOW_FADE_TIMEOUT);
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
