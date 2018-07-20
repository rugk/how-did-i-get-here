import {SessionStorage} from "./DataStorage/SessionStorage.js";

let tabValueCache;

let uniqueTabId = 0;

const COMMUNICATION_GET_TAB_DATA = "getTabData";

/**
 * Returns an object with only the important values of a tab.
 *
 * @function
 * @private
 * @param {Object} tab
 * @returns {bool}
 */
function extractImportantFromTab(tab) {
    return {
        id: tab.id,
        title: tab.title,
        url: tab.url,
        windowId: tab.windowId,
        favIconUrl: tab.favIconUrl,
        openerTabId: tab.openerTabId,
        hidden: tab.hidden,
        pinned: tab.pinned,
        incognito: tab.incognito,
    };
}

/**
 * Replies to a request for the tab history.
 *
 * The response may be undefined, if the tab value is not actually there
 * (but this is a rare situation).
 *
 * @function
 * @private
 * @param {Object} request
 * @param {Object} sender
 * @param {function} sendResponse
 * @returns {void}
 */
function messageGetHistory(request, sender, sendResponse) {
    if (request.type !== COMMUNICATION_GET_TAB_DATA) {
        return;
    }

    const uniqueTabId = request.uniqueTabId;

    const tabData = tabValueCache.get(uniqueTabId);
    sendResponse(tabData); /** @type {Object|null} */
}

/**
 * Saves the information about the parent tab and their state.
 *
 * @function
 * @private
 * @param {Object} tab
 * @returns {void}
 */
async function saveParentInfo(tab) {
    // add unique ID for current tab
    // using extra ID here as tab IDs can be reassigned when tabs are closed
    uniqueTabId++;
    browser.sessions.setTabValue(tab.id, "uniqueId", uniqueTabId);
    console.log(tab.id, "got:", uniqueTabId);

    const currentTabData = await browser.sessions.getTabValue(tab.id, "parentTab");

    // if it is a new tab and has no opener ID, there is nothing to save
    if (!tab.openerTabId) {
        return;
    }

    if (!currentTabData) {
        const parentTab = await browser.tabs.get(tab.openerTabId);
        const parentTabUniqueId = await browser.sessions.getTabValue(tab.openerTabId, "uniqueId");

        const parentTabReduced = extractImportantFromTab(parentTab);

        // add ID for parent tab
        parentTabReduced.openerUniqueTabId = parentTabUniqueId;

        // save parent tab data in cache
        tabValueCache.set(uniqueTabId, parentTabReduced);

        // and save all data to tab to easily get it
        browser.sessions.setTabValue(tab.id, "parentTab", parentTabReduced);
    }
}

/**
 * Init icon module.
 *
 * @function
 * @returns {void}
 */
export function init() {
    browser.runtime.onMessage.addListener(messageGetHistory);
    browser.tabs.onCreated.addListener(saveParentInfo);

    // set data storage
    tabValueCache = new SessionStorage();
    // tabValueCache = new Map();

    // save data of all tabs at startup
    browser.tabs.query({}).then((tabs) => {
        for (const tab of tabs) {
            saveParentInfo(tab);
        }
    });
}
