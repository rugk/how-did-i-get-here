const COMMUNICATION_GET_TAB_DATA = "getTabData";

const faviconCache = new Map();

/**
 * Searches through the favicon cache and returns it if one could be found.
 *
 * Returns an empty string in case of falure.
 *
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
 * original tab URI.
 * The currentTab may also not be availble, if the user already closed the tab.
 * In this case, only the historic values are available.
 * If the extension is newly installed, it _may_ also happen, that the historic
 * tab is not yet available.
 * (@TODO fix this!)
 *
 * In case a tab could not be found, an empty object is returned.
 *
 * @function
 * @param {Tab} tab the current tab
 * @param {Tab} tabOld the current historic tab
 * @returns {Promise}
 * @throws {Error} if no more parents could be found
 */
export async function getParentOfTab(tab, tabOld = {}) {
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
    if ((!historicParentTab || !historicParentTab.id) && tabOld.openerUniqueTabId && tabOld.openerTabId) {
        // try to use tabOld.openerTabId to guess open tab in case it is still open
        const getExistingParent = browser.tabs.get(tabOld.openerTabId).catch(() => {
            return {};
        });

        // try to get value from background cache
        historicParentTab = await browser.runtime.sendMessage({
            type: COMMUNICATION_GET_TAB_DATA,
            uniqueTabId: tabOld.openerUniqueTabId
        });

        parentTab = await getExistingParent.then((existingTab) => {
            // if IDs are the same, we can be sure the tabs are actually
            // the same and the tab ID was not just randomly reused
            // Otherwise, we have unfortunately no way of knowing that.
            if (existingTab.id && historicParentTab && historicParentTab.id && historicParentTab.id === existingTab.id && existingTab.url) {
                return existingTab;
            }

            return {};
        });
    }

    // if no parent could be found, throw exception
    if ((!historicParentTab && !tab.openerTabId) || (historicParentTab && !historicParentTab.url)) {
        throw new Error("no more parents found");
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
}

/**
 * Returns the whole history of the tab.
 *
 * @function
 * @returns {Object}
 */
export async function getCurrentTab() {
    const currentTabs = await browser.tabs.query({currentWindow: true, active: true});
    const currentTab = currentTabs[0];

    saveTabInCache(currentTab);
    return currentTab;
}
