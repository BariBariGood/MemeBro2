/**
 * @module textOverlay
 * Meme text rendering, dragging, resizing, rotating, and inline editing.
 * Manages the draggable text overlay on the meme canvas including font
 * selection, color pickers, text duplication, and copy/paste.
 */

import {
    DEFAULT_MEME_TEXT,
    DEFAULT_MEME_FONT_KEY,
    DEFAULT_MEME_FONT_SIZE_MODE,
    DEFAULT_MEME_TEXT_COLOR,
    DEFAULT_MEME_OUTLINE_ENABLED,
    DEFAULT_MEME_OUTLINE_COLOR,
    MEME_FONT_OPTIONS,
    MEME_TEXT_COLORS,
    ROTATE_STEP,
    MAX_MEME_TEXT_ITEMS,
} from "./constants.js";
import { state } from "./state.js";

// ── Font / color helpers ─────────────────────

export function getMemeFontFamily(fontKey = DEFAULT_MEME_FONT_KEY) {
    return MEME_FONT_OPTIONS[fontKey] || MEME_FONT_OPTIONS[DEFAULT_MEME_FONT_KEY];
}

export function getMemeTextColor(colorKey = DEFAULT_MEME_TEXT_COLOR) {
    if (typeof colorKey === "string" && colorKey.startsWith("#")) return colorKey;
    return MEME_TEXT_COLORS[colorKey] || MEME_TEXT_COLORS[DEFAULT_MEME_TEXT_COLOR];
}

export function getEditableTextValue(node) {
    return node?.innerText ?? node?.textContent ?? "";
}

// ── Outline ──────────────────────────────────

export function applyMemeOutline(preview) {
    if (!state.editor.overlayOutlineEnabled) {
        preview.style.textShadow = "none";
        return;
    }
    const color      = state.editor.overlayOutlineColor || "#ffffff";
    const renderedPx = parseFloat(preview.style.fontSize) || Number(state.editor.overlayFontPx || 22);
    const t          = Math.max(1, Math.round(renderedPx / 12));
    const offsets    = [[-t, -t], [t, -t], [-t, t], [t, t], [0, -t], [0, t], [-t, 0], [t, 0]];
    preview.style.textShadow = offsets.map(([x, y]) => `${x}px ${y}px 0 ${color}`).join(", ");
}

export function syncOutlineSwatchState({ dom }) {
    const enabled = !!state.editor.overlayOutlineEnabled;
    dom.outlineColorGroup?.classList.toggle("is-off", !enabled);
    dom.memeOutlineRemoveCta?.classList.toggle("hidden", !enabled);
}

// ── Canvas fit ───────────────────────────────

export function fitMemeTextToCanvas({ dom }) {
    const preview = dom.memeTextPreview;
    const art     = dom.studioTemplateArt;
    if (!preview || !art) return 1;

    const artRect = art.getBoundingClientRect();
    if (!artRect.width || !artRect.height) {
        state.editor.overlayAutoScale = 1;
        preview.dataset.fitScale      = "1.00";
        preview.style.fontSize        = "";
        return 1;
    }

    const basePx   = Number(state.editor.overlayFontPx || 22);
    let fitScale   = 1;
    const minScale = 0.42;

    while (fitScale >= minScale) {
        preview.style.fontSize = `${Math.max(8, basePx * fitScale)}px`;
        const previewRect = preview.getBoundingClientRect();
        const okH = previewRect.left >= artRect.left + 12 && previewRect.right  <= artRect.right  - 12;
        const okV = previewRect.top  >= artRect.top  + 12 && previewRect.bottom <= artRect.bottom - 12;
        if (okH && okV) break;
        fitScale = Number((fitScale - 0.04).toFixed(2));
    }

    const clamped = Math.max(fitScale, minScale);
    preview.style.fontSize        = `${Math.max(8, basePx * clamped)}px`;
    preview.dataset.fitScale      = clamped.toFixed(2);
    state.editor.overlayAutoScale = clamped;
    return clamped;
}

// ── Handle positions ─────────────────────────

export function positionTextHandles({ dom, clamp }) {
    if (!dom.memeTextResizeHandles?.length) return;
    const artRect  = dom.studioTemplateArt?.getBoundingClientRect();
    const textRect = dom.memeTextPreview?.getBoundingClientRect();
    if (!artRect?.width || !textRect?.width) return;

    const centerX        = (clamp(state.editor.overlayX, 5, 95) / 100) * artRect.width;
    const centerY        = (clamp(state.editor.overlayY, 5, 95) / 100) * artRect.height;
    const unrotatedWidth  = dom.memeTextPreview.offsetWidth  || textRect.width;
    const unrotatedHeight = dom.memeTextPreview.offsetHeight || textRect.height;
    const radians = ((Number(state.editor.overlayRotation) || 0) * Math.PI) / 180;
    const cos     = Math.cos(radians);
    const sin     = Math.sin(radians);
    const corners = {
        nw: [-unrotatedWidth / 2, -unrotatedHeight / 2],
        ne: [ unrotatedWidth / 2, -unrotatedHeight / 2],
        sw: [-unrotatedWidth / 2,  unrotatedHeight / 2],
        se: [ unrotatedWidth / 2,  unrotatedHeight / 2],
    };

    dom.memeTextResizeHandles.forEach((handle) => {
        const corner     = handle.dataset.resizeCorner || "se";
        const handleSize = handle.offsetWidth || 14;
        const [ox, oy]   = corners[corner] || corners.se;
        const x = centerX + ox * cos - oy * sin;
        const y = centerY + ox * sin + oy * cos;
        handle.style.left = `${x - handleSize / 2}px`;
        handle.style.top  = `${y - handleSize / 2}px`;
    });

    if (dom.textLocalControls) {
        const cw      = dom.textLocalControls.offsetWidth || 230;
        const rawLeft = textRect.left + textRect.width / 2;
        const left    = clamp(rawLeft, artRect.left + cw / 2 + 8, artRect.right - cw / 2 - 8);
        const above   = textRect.top - artRect.top;
        const top     = above >= 48 ? textRect.top - 50 : Math.min(textRect.bottom + 8, artRect.bottom - 44);
        dom.textLocalControls.style.position  = "fixed";
        dom.textLocalControls.style.left      = `${left}px`;
        dom.textLocalControls.style.top       = `${top}px`;
        dom.textLocalControls.style.transform = "translateX(-50%)";
    }

    if (dom.textMoreMenu) {
        const mw      = dom.textMoreMenu.offsetWidth || 160;
        const rawLeft = textRect.left + textRect.width / 2;
        const left    = clamp(rawLeft, artRect.left + mw / 2 + 8, artRect.right - mw / 2 - 8);
        dom.textMoreMenu.style.position  = "fixed";
        dom.textMoreMenu.style.left      = `${left}px`;
        dom.textMoreMenu.style.top       = `${textRect.top - 8}px`;
        dom.textMoreMenu.style.transform = "translate(-50%, -100%)";
    }
}

// ── Full appearance sync ─────────────────────

export function syncMemeTextAppearance({ dom, clamp }) {
    const preview = dom.memeTextPreview;
    if (!preview) return 1;
    const textColor = getMemeTextColor(state.editor.overlayTextColor);

    preview.style.left          = `${clamp(state.editor.overlayX, 5, 95)}%`;
    preview.style.top           = `${clamp(state.editor.overlayY, 5, 95)}%`;
    preview.style.width         = `${clamp(state.editor.overlayWidthPct, 18, 90)}%`;
    preview.style.setProperty("--meme-text-rotate", `${state.editor.overlayRotation}deg`);
    preview.style.transform     = `translate(-50%, -50%) rotate(${state.editor.overlayRotation}deg)`;
    preview.style.fontFamily    = getMemeFontFamily(state.editor.overlayFontKey);
    preview.style.fontWeight    = state.editor.overlayBold      ? "700"       : "400";
    preview.style.fontStyle     = state.editor.overlayItalic    ? "italic"    : "normal";
    preview.style.textDecoration = state.editor.overlayUnderline ? "underline" : "none";
    preview.style.color         = textColor;
    preview.style.caretColor    = textColor;

    const scale = fitMemeTextToCanvas({ dom });
    applyMemeOutline(preview);
    positionTextHandles({ dom, clamp });
    return scale;
}

// ── Frozen text items ────────────────────────

export function freezeCurrentTextItem() {
    if (!state.editor.overlayVisible) return;
    const text = (state.editor.overlayText || "").trim();
    if (!text) return;
    state.editor.frozenTextItems.push({
        text,
        fontKey:      state.editor.overlayFontKey,
        fontPx:       state.editor.overlayFontPx,
        color:        state.editor.overlayTextColor,
        outline:      state.editor.overlayOutlineEnabled,
        outlineColor: state.editor.overlayOutlineColor,
        bold:         state.editor.overlayBold,
        italic:       state.editor.overlayItalic,
        underline:    state.editor.overlayUnderline,
        x:            state.editor.overlayX,
        y:            state.editor.overlayY,
        widthPct:     state.editor.overlayWidthPct,
        rotation:     state.editor.overlayRotation,
        locked:       state.isTextLocked,
    });
}

export function renderFrozenTextItems({ dom, clamp }) {
    if (!dom.studioTemplateArt) return;
    dom.studioTemplateArt.querySelectorAll(".frozen-text-item").forEach((n) => n.remove());
    state.editor.frozenTextItems.forEach((item, index) => {
        const node = document.createElement("div");
        node.className          = "frozen-text-item";
        node.dataset.textIndex  = String(index);
        node.textContent        = item.text;
        node.style.left         = `${item.x}%`;
        node.style.top          = `${item.y}%`;
        node.style.width        = `${clamp(Number(item.widthPct) || 48, 18, 90)}%`;
        node.style.transform    = `translate(-50%, -50%) rotate(${item.rotation || 0}deg)`;
        node.style.fontFamily   = getMemeFontFamily(item.fontKey);
        node.style.fontSize     = `${Math.max(8, Number(item.fontPx) || 22)}px`;
        node.style.color        = item.color?.startsWith?.("#") ? item.color : getMemeTextColor(item.color);
        node.style.fontWeight   = item.bold      ? "700"       : "400";
        node.style.fontStyle    = item.italic    ? "italic"    : "normal";
        node.style.textDecoration = item.underline ? "underline" : "none";
        node.style.textShadow   = item.outline
        ? `-2px -2px 0 ${item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR}, 2px -2px 0 ${item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR}, -2px 2px 0 ${item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR}, 2px 2px 0 ${item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR}`
        : "none";
        node.style.cursor = "text";
        dom.studioTemplateArt.appendChild(node);
    });
}

export function selectFrozenTextItem(index, { recordEditorSnapshot, render }) {
    const item = state.editor.frozenTextItems[index];
    if (!item) return;
    freezeCurrentTextItem();
    state.editor.frozenTextItems.splice(index, 1);
    state.editor.overlayText          = item.text;
    state.editor.overlayFontKey       = item.fontKey;
    state.editor.overlayFontPx        = Number(item.fontPx) || 22;
    state.editor.overlayTextColor     = item.color;
    state.editor.overlayOutlineEnabled = item.outline ?? false;
    state.editor.overlayOutlineColor  = item.outlineColor || DEFAULT_MEME_OUTLINE_COLOR;
    state.editor.overlayBold          = item.bold      ?? false;
    state.editor.overlayItalic        = item.italic    ?? false;
    state.editor.overlayUnderline     = item.underline ?? false;
    state.editor.overlayX             = item.x;
    state.editor.overlayY             = item.y;
    state.editor.overlayWidthPct      = Number(item.widthPct) || 48;
    state.editor.overlayRotation      = item.rotation || 0;
    state.editor.overlayVisible       = true;
    state.isTextLocked                = Boolean(item.locked);
    state.isTextSelected              = true;
    state.isEditingMemeText           = false;
    state.showTextMore                = false;
    recordEditorSnapshot();
    render();
}

// ── Create / select at pointer ───────────────

export function createOrSelectTextAtPointer(event, { dom, clamp, recordEditorSnapshot, beginInlineTextEdit }) {
    const totalItems = state.editor.frozenTextItems.length + (state.editor.overlayVisible ? 1 : 0);
    if (totalItems >= MAX_MEME_TEXT_ITEMS) return;
    const artRect  = dom.studioTemplateArt.getBoundingClientRect();
    const xPercent = clamp(((event.clientX - artRect.left) / artRect.width)  * 100, 5, 95);
    const yPercent = clamp(((event.clientY - artRect.top)  / artRect.height) * 100, 5, 95);
    if (state.editor.overlayVisible) freezeCurrentTextItem();

    state.editor.overlayText           = DEFAULT_MEME_TEXT;
    state.editor.overlayFontKey        = DEFAULT_MEME_FONT_KEY;
    state.editor.overlaySizeMode       = DEFAULT_MEME_FONT_SIZE_MODE;
    state.editor.overlayFontPx         = 22;
    state.editor.overlayTextColor      = DEFAULT_MEME_TEXT_COLOR;
    state.editor.overlayOutlineEnabled = DEFAULT_MEME_OUTLINE_ENABLED;
    state.editor.overlayOutlineColor   = DEFAULT_MEME_OUTLINE_COLOR;
    state.editor.overlayBold           = false;
    state.editor.overlayItalic         = false;
    state.editor.overlayUnderline      = false;
    state.editor.overlayRotation       = 0;
    state.isTextLocked                 = false;
    state.editor.overlayX              = xPercent;
    state.editor.overlayY              = yPercent;
    state.isEditingMemeText            = false;
    state.editor.overlayVisible        = true;
    state.isTextSelected               = true;
    state.showTextMore                 = false;
    dom.memeTextPreview.textContent    = DEFAULT_MEME_TEXT;
    dom.memeTextPreview.classList.add("is-placeholder");
    recordEditorSnapshot();
    beginInlineTextEdit();
}

// ── Settings ─────────────────────────────────

export function updateEditorTextSetting(key, value, { recordEditorSnapshot, render }) {
    state.editor[key]           = value;
    state.showResetConfirmation = false;
    recordEditorSnapshot();
    render();
}

// ── Inline editing ───────────────────────────

export function beginInlineTextEdit(event, { dom, render }) {
    event?.stopPropagation();
    if (state.textDidDrag) return;
    if (!state.editor.overlayVisible) return;
    state.isEditingMemeText = true;
    state.isTextSelected    = true;
    if ((state.editor.overlayText || "").trim().toUpperCase() === DEFAULT_MEME_TEXT) {
        state.editor.overlayText = "";
    }
    dom.memeTextPreview.classList.remove("is-placeholder");
    dom.memeTextPreview.contentEditable = "true";
    requestAnimationFrame(() => dom.memeTextPreview.focus());
    render();
}

export function selectTextObject(event, { render, beginInlineTextEdit }) {
    event?.stopPropagation();
    if (!state.editor.overlayVisible) return;
    if (state.textDidDrag) return;
    if (beginInlineTextEdit &&
        (state.editor.overlayText || "").trim().toUpperCase() === DEFAULT_MEME_TEXT) {
        state.showTextMore = false;
        beginInlineTextEdit(event);
        return;
    }
    state.isTextSelected = true;
    state.showTextMore   = false;
    render();
}

export function finishInlineTextEdit({ dom, recordEditorSnapshot, render }) {
    state.isEditingMemeText  = false;
    const raw = getEditableTextValue(dom.memeTextPreview).trim();
    state.editor.overlayText = raw || DEFAULT_MEME_TEXT;
    dom.memeTextPreview.textContent = state.editor.overlayText;
    dom.memeTextPreview.classList.toggle("is-placeholder", !raw);
    recordEditorSnapshot();
    render();
}

export function deleteMemeText({ recordEditorSnapshot, render }) {
    state.editor.overlayVisible  = false;
    state.isTextSelected         = false;
    state.isEditingMemeText      = false;
    state.showResetConfirmation  = false;
    recordEditorSnapshot();
    render();
}

// ── Drag ─────────────────────────────────────

export function startTextDrag(event, { dom }) {
    if (!state.editor.overlayVisible || state.isTextLocked) return;
    event.preventDefault();
    state.isTextSelected      = true;
    state.textDidDrag         = false;
    state.textDragPointerId   = event.pointerId;
    state.textPointerStartX   = event.clientX;
    state.textPointerStartY   = event.clientY;
    state.textStartX          = state.editor.overlayX;
    state.textStartY          = state.editor.overlayY;
    dom.memeTextPreview.setPointerCapture(event.pointerId);
}

export function moveTextDrag(event, { dom, clamp, render }) {
    if (state.textDragPointerId !== event.pointerId) return;
    event.preventDefault();
    const artRect  = dom.studioTemplateArt.getBoundingClientRect();
    if (!artRect.width || !artRect.height) return;
    const dxPct = (event.clientX - state.textPointerStartX) / artRect.width  * 100;
    const dyPct = (event.clientY - state.textPointerStartY) / artRect.height * 100;
    const halfW = (state.editor.overlayWidthPct || 48) / 2;
    const minX  = Math.max(5, halfW);
    const maxX  = Math.min(95, 100 - halfW);
    state.editor.overlayX = clamp(state.textStartX + dxPct, minX, maxX);
    state.editor.overlayY = clamp(state.textStartY + dyPct, 5, 95);
    if (Math.abs(dxPct) > 0.1 || Math.abs(dyPct) > 0.1) state.textDidDrag = true;
    render();
}

export function endTextDrag(event, { recordEditorSnapshot }) {
    if (state.textDragPointerId !== event.pointerId) return;
    event.preventDefault();
    state.textDragPointerId = null;
    if (state.textDidDrag) {
        recordEditorSnapshot();
        setTimeout(() => { state.textDidDrag = false; }, 0);
    }
}

// ── Resize ───────────────────────────────────

export function startTextResize(event) {
    if (!state.editor.overlayVisible || state.isTextLocked) return;
    event.preventDefault();
    event.stopPropagation();
    state.textResizePointerId  = event.pointerId;
    state.textPointerStartX    = event.clientX;
    state.textStartWidth       = state.editor.overlayWidthPct;
    state.textResizeDirection  = event.currentTarget?.dataset?.resizeCorner?.includes("w") ? -1 : 1;
    event.currentTarget?.setPointerCapture?.(event.pointerId);
}

export function moveTextResize(event, { dom, clamp, render }) {
    if (state.textResizePointerId !== event.pointerId) return;
    event.preventDefault();
    const artRect = dom.studioTemplateArt.getBoundingClientRect();
    const dxPct   = ((event.clientX - state.textPointerStartX) / artRect.width) * 100;
    state.editor.overlayWidthPct = clamp(state.textStartWidth + dxPct * state.textResizeDirection, 18, 90);
    render();
}

export function endTextResize(event, { recordEditorSnapshot }) {
    if (state.textResizePointerId !== event.pointerId) return;
    event.preventDefault();
    state.textResizePointerId = null;
    recordEditorSnapshot();
}

// ── Rotate ───────────────────────────────────

export function rotateTextOneStep(event, { recordEditorSnapshot, render }) {
    if (!state.editor.overlayVisible || state.isTextLocked) return;
    event?.preventDefault();
    event?.stopPropagation();
    const current = Number.isFinite(state.editor.overlayRotation) ? state.editor.overlayRotation : 0;
    const next    = (((current + ROTATE_STEP) % 360) + 360) % 360;
    state.editor.overlayRotation = next === 360 ? 0 : next;
    recordEditorSnapshot();
    render();
}