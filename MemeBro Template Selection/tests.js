/**
 * @jest-environment jsdom
 */

const catalog = require("./templates.json");

const { templates, grid } = catalog;
const { breakpoints, imageLoading, search } = grid;

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

function renderGrid(width) {
  setViewport(width);
  document.body.innerHTML = "";

  const breakpoint = getBreakpointConfig(window.innerWidth);
  const start = performance.now();
  const container = document.createElement("section");
  container.setAttribute("data-testid", "meme-grid-container");

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

  templates.forEach((meme) => {
    const card = document.createElement("article");
    card.setAttribute("data-testid", "meme-card");
    card.setAttribute("data-template-id", meme.id);

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

  let lastFilterTimeMs = 0;

  searchInput.addEventListener("input", (event) => {
    lastFilterTimeMs = applySearchFilter(gridElement, event.target.value);
  });

  container.appendChild(searchInput);
  container.appendChild(gridElement);
  document.body.appendChild(container);

  return {
    container,
    searchInput,
    gridElement,
    renderTimeMs: performance.now() - start,
    breakpoint,
    getLastFilterTimeMs: () => lastFilterTimeMs,
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
  afterEach(() => {
    document.body.innerHTML = "";
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
    expect(firstCaption.textContent).toBe(templates[0].name);
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
    expect(firstCaption.textContent).toBe(templates[0].name);
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

    expect(images).toHaveLength(templates.length);

    images.forEach((image, index) => {
      const meme = templates[index];

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

    expect(cards).toHaveLength(templates.length);

    cards.forEach((card, index) => {
      const image = card.querySelector('[data-testid="meme-image"]');
      const caption = card.querySelector('[data-testid="meme-name"]');
      const meme = templates[index];

      expect(image.alt).toBe(meme.name);
      expect(caption.textContent).toBe(meme.name);
      expect(image.nextElementSibling).toBe(caption);
    });
  });

  test("renders the search bar at the top of the grid", () => {
    const { container, searchInput, gridElement } = renderGrid(1440);

    expect(search.enabled).toBe(true);
    expect(container.firstElementChild).toBe(searchInput);
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

    expect(visibleCards).toHaveLength(templates.length);
  });

  test("applies search results in under 500ms", () => {
    const { searchInput, getLastFilterTimeMs } = renderGrid(1440);

    searchInput.value = "reaction";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(getLastFilterTimeMs()).toBeLessThanOrEqual(search.maxFilterResponseMs);
  });

  test("ensures none of the meme properties are empty", () => {
    templates.forEach((meme, index) => {
      assertNoEmptyValues(meme, `templates[${index}]`);
    });
  });
});
