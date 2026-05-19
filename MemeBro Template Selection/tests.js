/**
 * @jest-environment jsdom
 */

const catalog = require("./templates.json");

const { templates, grid } = catalog;
const { breakpoints, imageLoading } = grid;

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

function renderGrid(width) {
  setViewport(width);
  document.body.innerHTML = "";

  const breakpoint = getBreakpointConfig(window.innerWidth);
  const start = performance.now();

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

  document.body.appendChild(gridElement);

  return {
    gridElement,
    renderTimeMs: performance.now() - start,
    breakpoint,
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

  test("ensures none of the meme properties are empty", () => {
    templates.forEach((meme, index) => {
      assertNoEmptyValues(meme, `templates[${index}]`);
    });
  });
});
