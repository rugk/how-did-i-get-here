import * as TabHistory from "./TabHistory.js";
import * as Controller from "./Controller.js";

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
 * @function
 * @private
 * @param {integer} tabId
 * @param {HTMLElement} elTab
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
        destroyTabList();
        Controller.run();
    });
}

/**
 * When one item of the tab list is clicked.
 *
 * @function
 * @private
 * @param {Event} event
 * @returns {void}
 */
function tabClick(event) {
    const elTab = event.currentTarget.parentElement;

    if (elTab.classList.contains("unverifiedTab")) {
        console.log("skip opening unverfied tab ID, because it is likely closed"); // TODO: show real notification
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
 * @function
 * @private
 * @param {Object} currentTab
 * @param {Object} historicTab
 * @param {HTMLElement} elGroup the place where to add the element
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
        elGroup.classList.add("unverifiedTab");
    }
    // save ID of tab
    elGroup.dataset.tabId = tabPreferActive.id;
    elGroup.dataset.windowId = tabPreferActive.windowId;

    // special handling if historic tab and current tab differ
    if (historicTab && historicTab.url !== currentTab.url) {
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
 * @function
 * @returns {void}
 */
export function resetUi() {
    historyCount = 0;
    elLastHistory = document.getElementById("tabhistory");

    elNoElementFound.classList.add("invisible");
}

/**
 * Destroys the current tab list.
 *
 * @name   UserInterface.destroyTabList
 * @function
 * @returns {void}
 */
export function destroyTabList() {
    const elementChild = document.getElementById("tabhistory").firstElementChild;
    if (elLastHistory.firstElementChild) {
        elementChild.remove();
    }
}

/**
 * Creates the basic UI structure.
 *
 * @function
 * @returns {void}
 */
export async function buildUi() {
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
}

/**
 * Inits module.
 *
 * @function
 * @returns {void}
 */
export function init() {
    elBackButton.addEventListener("click", goBack);
}
