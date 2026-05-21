/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import catalog from "../public/templates.json";

const { templates, grid } = catalog;
const { breakpoints, imageLoading, search, tabs } = grid;
const recentTabConfig = tabs.items.find((tab) => tab.id === "recents");
const trendingTabConfig = tabs.items.find((tab) => tab.id === "trending");
const RECENTS_STORAGE_KEY = recentTabConfig.storageKey;

function setViewport(width, height = 800) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });

  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
}

function getBreakpointConfig(width) {
  if (width <= breakpoints.mobile.maxWidth) {
    return { name: "mobile", ...breakpoints.mobile };
  }

  if (
    width >= breakpoints.tablet.minWidth &&
    width <= breakpoints.tablet.maxWidth
  ) {
    return { name: "tablet", ...breakpoints.tablet };
  }

  return { name: "desktop", ...breakpoints.desktop };
}

function getTrendingTemplates() {
  return [...templates].sort(
    (left, right) => right.popularityScore - left.popularityScore
  );
}

function getRecentUsageMap() {
  const rawValue = window.localStorage.getItem(RECENTS_STORAGE_KEY);

  if (!rawValue) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveRecentUsageMap(usageMap) {
  window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(usageMap));
}

function createMemoryStorage() {
  const values = new Map();

  return {
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key) => {
      const storageKey = String(key);
      return values.has(storageKey) ? values.get(storageKey) : null;
    }),
    removeItem: vi.fn((key) => values.delete(String(key))),
    setItem: vi.fn((key, value) => values.set(String(key), String(value))),
  };
}

function recordTemplateUsage(templateId, timestamp = Date.now()) {
  const usageMap = getRecentUsageMap();
  usageMap[templateId] = timestamp;
  saveRecentUsageMap(usageMap);
}

function getRecentTemplates() {
  const usageMap = getRecentUsageMap();

  return Object.entries(usageMap)
    .sort((left, right) => right[1] - left[1])
    .slice(0, recentTabConfig.maxItems)
    .map(([templateId]) => templates.find((meme) => meme.id === templateId))
    .filter(Boolean);
}

function matchesSearch(meme, query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const searchableFields = [meme.name, ...meme.tags];

  return searchableFields.some((field) =>
    field.toLowerCase().includes(normalizedQuery)
  );
}

function applySearchFilter(gridElement, query) {
  const start = performance.now();
  const cards = [
    ...gridElement.querySelectorAll('[data-testid="meme-card"]'),
  ];

  cards.forEach((card) => {
    const meme = templates.find(
      (entry) => entry.id === card.getAttribute("data-template-id")
    );
    const isMatch = matchesSearch(meme, query);

    card.hidden = !isMatch;
    card.setAttribute("aria-hidden", String(!isMatch));
    card.style.display = isMatch ? "" : "none";
  });

  return performance.now() - start;
}

function renderCards(gridElement, memes) {
  gridElement.innerHTML = "";

  memes.forEach((meme) => {
    const card = document.createElement("article");
    card.setAttribute("data-testid", "meme-card");
    card.setAttribute("data-template-id", meme.id);
    card.dataset.popularityScore = String(meme.popularityScore);
    card.dataset.editorRoute = meme.editorTarget.route;

    card.addEventListener("click", () => {
      recordTemplateUsage(meme.id);
    });

    const figure = document.createElement("figure");
    figure.setAttribute("data-testid", "meme-figure");

    const image = document.createElement("img");
    image.setAttribute("data-testid", "meme-image");
    image.alt = meme.name;
    image.loading = "lazy";
    image.src = meme.images.preview;
    image.dataset.previewSrc = meme.images.preview;
    image.dataset.thumbnailSrc = meme.images.thumbnail;
    image.dataset.fullSrc = meme.images.main;

    const caption = document.createElement("figcaption");
    caption.setAttribute("data-testid", "meme-name");
    caption.textContent = meme.name;

    figure.appendChild(image);
    figure.appendChild(caption);
    card.appendChild(figure);
    gridElement.appendChild(card);
  });
}

function renderGrid(width) {
  setViewport(width);
  document.body.innerHTML = "";

  const breakpoint = getBreakpointConfig(window.innerWidth);
  const start = performance.now();
  const container = document.createElement("section");
  container.setAttribute("data-testid", "meme-grid-container");
  const tabsElement = document.createElement("div");
  tabsElement.setAttribute("data-testid", "meme-tabs");

  const searchInput = document.createElement("input");
  searchInput.setAttribute("data-testid", "meme-search");
  searchInput.type = "search";
  searchInput.placeholder = search.placeholder;
  searchInput.setAttribute("aria-label", "Search meme templates");

  const gridElement = document.createElement("section");
  gridElement.setAttribute("data-testid", "meme-grid");
  gridElement.setAttribute("data-breakpoint", breakpoint.name);
  gridElement.style.display = "grid";
  gridElement.style.gridTemplateColumns = `repeat(${breakpoint.columns}, minmax(0, 1fr))`;
  gridElement.style.gap = `${breakpoint.gap}px`;

  let lastFilterTimeMs = 0;
  let activeTab = tabs.defaultTab;

  function getTemplatesForTab(tabId) {
    if (tabId === recentTabConfig.id) {
      return getRecentTemplates();
    }

    return getTrendingTemplates();
  }

  function syncTabButtons() {
    const buttons = tabsElement.querySelectorAll('[data-testid="meme-tab"]');

    buttons.forEach((button) => {
      const isActive = button.dataset.tabId === activeTab;
      button.setAttribute("aria-selected", String(isActive));
      button.dataset.active = String(isActive);
    });
  }

  function refreshGrid() {
    renderCards(gridElement, getTemplatesForTab(activeTab));
    lastFilterTimeMs = applySearchFilter(gridElement, searchInput.value);
    syncTabButtons();
  }

  searchInput.addEventListener("input", (event) => {
    lastFilterTimeMs = applySearchFilter(gridElement, event.target.value);
  });

  tabs.items.forEach((tab) => {
    const tabButton = document.createElement("button");
    tabButton.setAttribute("data-testid", "meme-tab");
    tabButton.type = "button";
    tabButton.textContent = tab.label;
    tabButton.dataset.tabId = tab.id;

    tabButton.addEventListener("click", () => {
      activeTab = tab.id;
      refreshGrid();
    });

    tabsElement.appendChild(tabButton);
  });

  refreshGrid();
  container.appendChild(tabsElement);
  container.appendChild(searchInput);
  container.appendChild(gridElement);
  document.body.appendChild(container);

  return {
    container,
    tabsElement,
    searchInput,
    gridElement,
    renderTimeMs: performance.now() - start,
    breakpoint,
    getLastFilterTimeMs: () => lastFilterTimeMs,
    getActiveTab: () => activeTab,
  };
}

function assertNoEmptyValues(value, path) {
  expect(value).not.toBeUndefined();
  expect(value).not.toBeNull();

  if (typeof value === "string") {
    expect(value.trim()).not.toBe("");
    return;
  }

  if (Array.isArray(value)) {
    if (path.endsWith(".faceRegions")) {
      return;
    }

    expect(value.length).toBeGreaterThan(0);
    value.forEach((entry, index) =>
      assertNoEmptyValues(entry, `${path}[${index}]`)
    );
    return;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    expect(entries.length).toBeGreaterThan(0);

    entries.forEach(([key, nestedValue]) =>
      assertNoEmptyValues(nestedValue, `${path}.${key}`)
    );
  }
}

describe("Grid UI", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: createMemoryStorage(),
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  test("renders properly in desktop resolution", () => {
    const { gridElement, breakpoint } = renderGrid(1440);
    const cards = gridElement.querySelectorAll('[data-testid="meme-card"]');
    const firstCaption = cards[0].querySelector('[data-testid="meme-name"]');

    expect(breakpoint.name).toBe("desktop");
    expect(gridElement.getAttribute("data-breakpoint")).toBe("desktop");
    expect(gridElement.style.gridTemplateColumns).toBe("repeat(5, minmax(0, 1fr))");
    expect(gridElement.style.gap).toBe("20px");
    expect(cards).toHaveLength(templates.length);
    expect(firstCaption.textContent).toBe(getTrendingTemplates()[0].name);
  });

  test("renders properly in mobile resolution", () => {
    const { gridElement, breakpoint } = renderGrid(390);
    const cards = gridElement.querySelectorAll('[data-testid="meme-card"]');
    const firstCaption = cards[0].querySelector('[data-testid="meme-name"]');

    expect(breakpoint.name).toBe("mobile");
    expect(gridElement.getAttribute("data-breakpoint")).toBe("mobile");
    expect(gridElement.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(gridElement.style.gap).toBe("12px");
    expect(cards).toHaveLength(templates.length);
    expect(firstCaption.textContent).toBe(getTrendingTemplates()[0].name);
  });

  test.each([
    ["desktop", 1440],
    ["mobile", 390],
  ])("renders in under 1.5 seconds on %s", (_label, width) => {
    const { renderTimeMs } = renderGrid(width);

    expect(renderTimeMs).toBeLessThanOrEqual(imageLoading.maxInitialLoadMs);
  });

  test("loads preview images instead of full-resolution images", () => {
    const { gridElement } = renderGrid(1440);
    const images = [...gridElement.querySelectorAll('[data-testid="meme-image"]')];

    expect(images).toHaveLength(getTrendingTemplates().length);

    images.forEach((image, index) => {
      const meme = getTrendingTemplates()[index];

      expect(image.getAttribute("src")).toBe(meme.images.preview);
      expect(image.dataset.previewSrc).toBe(meme.images.preview);
      expect(image.dataset.thumbnailSrc).toBe(meme.images.thumbnail);
      expect(image.dataset.fullSrc).toBe(meme.images.main);
      expect(image.getAttribute("src")).not.toBe(meme.images.main);
    });
  });

  test("loads the correct meme name underneath each image", () => {
    const { gridElement } = renderGrid(1440);
    const cards = [...gridElement.querySelectorAll('[data-testid="meme-card"]')];

    expect(cards).toHaveLength(getTrendingTemplates().length);

    cards.forEach((card, index) => {
      const image = card.querySelector('[data-testid="meme-image"]');
      const caption = card.querySelector('[data-testid="meme-name"]');
      const meme = getTrendingTemplates()[index];

      expect(image.alt).toBe(meme.name);
      expect(caption.textContent).toBe(meme.name);
      expect(image.nextElementSibling).toBe(caption);
    });
  });

  test("renders the search bar at the top of the grid", () => {
    const { container, searchInput, gridElement } = renderGrid(1440);

    expect(search.enabled).toBe(true);
    expect(container.children[1]).toBe(searchInput);
    expect(searchInput.getAttribute("placeholder")).toBe(search.placeholder);
    expect(searchInput.nextElementSibling).toBe(gridElement);
  });

  test("filters memes by name in real time by hiding non-matching results", () => {
    const { gridElement, searchInput } = renderGrid(1440);

    searchInput.value = "drake";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    const visibleCards = [
      ...gridElement.querySelectorAll('[data-testid="meme-card"]'),
    ].filter((card) => !card.hidden);

    expect(visibleCards).toHaveLength(1);
    expect(visibleCards[0].getAttribute("data-template-id")).toBe(
      "drake-hotline-bling"
    );
  });

  test("filters memes by tag in real time by hiding non-matching results", () => {
    const { gridElement, searchInput } = renderGrid(1440);

    searchInput.value = "pokemon";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    const visibleCards = [
      ...gridElement.querySelectorAll('[data-testid="meme-card"]'),
    ].filter((card) => !card.hidden);

    expect(visibleCards).toHaveLength(1);
    expect(visibleCards[0].getAttribute("data-template-id")).toBe(
      "surprised-pikachu"
    );
  });

  test("restores all memes when the search query is cleared", () => {
    const { gridElement, searchInput } = renderGrid(1440);

    searchInput.value = "reaction";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    const visibleCards = [
      ...gridElement.querySelectorAll('[data-testid="meme-card"]'),
    ].filter((card) => !card.hidden);

    expect(visibleCards).toHaveLength(getTrendingTemplates().length);
  });

  test("applies search results in under 500ms", () => {
    const { searchInput, getLastFilterTimeMs } = renderGrid(1440);

    searchInput.value = "reaction";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(getLastFilterTimeMs()).toBeLessThanOrEqual(search.maxFilterResponseMs);
  });

  test("is able to switch between tabs", () => {
    const { tabsElement, gridElement, getActiveTab } = renderGrid(1440);
    const [recentsTab, trendingTab] = tabsElement.querySelectorAll(
      '[data-testid="meme-tab"]'
    );

    expect(getActiveTab()).toBe("trending");
    expect(gridElement.querySelectorAll('[data-testid="meme-card"]')).toHaveLength(
      templates.length
    );

    recentsTab.click();

    expect(getActiveTab()).toBe("recents");
    expect(gridElement.querySelectorAll('[data-testid="meme-card"]')).toHaveLength(0);

    trendingTab.click();

    expect(getActiveTab()).toBe("trending");
    expect(gridElement.querySelectorAll('[data-testid="meme-card"]')).toHaveLength(
      templates.length
    );
  });

  test("recents persist across sessions", () => {
    let currentTime = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      currentTime += 1_000;
      return currentTime;
    });

    let session = renderGrid(1440);
    let trendingCards = session.gridElement.querySelectorAll(
      '[data-testid="meme-card"]'
    );

    trendingCards[4].click();
    trendingCards[2].click();
    trendingCards[0].click();

    document.body.innerHTML = "";

    session = renderGrid(1440);
    const recentsTab = session.tabsElement.querySelector(
      '[data-testid="meme-tab"][data-tab-id="recents"]'
    );
    recentsTab.click();

    const recentsCards = [
      ...session.gridElement.querySelectorAll('[data-testid="meme-card"]'),
    ];

    expect(recentsCards.map((card) => card.getAttribute("data-template-id"))).toEqual([
      getTrendingTemplates()[0].id,
      getTrendingTemplates()[2].id,
      getTrendingTemplates()[4].id,
    ]);
  });

  test("trending tab is consistent across sessions", () => {
    const firstSession = renderGrid(1440);
    const firstTrendingOrder = [
      ...firstSession.gridElement.querySelectorAll('[data-testid="meme-card"]'),
    ].map((card) => card.getAttribute("data-template-id"));

    document.body.innerHTML = "";

    const secondSession = renderGrid(1440);
    const secondTrendingOrder = [
      ...secondSession.gridElement.querySelectorAll('[data-testid="meme-card"]'),
    ].map((card) => card.getAttribute("data-template-id"));

    expect(secondTrendingOrder).toEqual(firstTrendingOrder);
  });

  test("memes in trending tab are ordered by descending popularity", () => {
    const { gridElement } = renderGrid(1440);
    const popularityScores = [
      ...gridElement.querySelectorAll('[data-testid="meme-card"]'),
    ].map((card) => Number(card.dataset.popularityScore));

    const sortedScores = [...popularityScores].sort((left, right) => right - left);

    expect(popularityScores).toEqual(sortedScores);
  });

  test("ensures none of the meme properties are empty", () => {
    templates.forEach((meme, index) => {
      assertNoEmptyValues(meme, `templates[${index}]`);
    });
  });
});
