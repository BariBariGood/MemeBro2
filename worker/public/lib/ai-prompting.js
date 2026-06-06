import { getLoadErrorMessage } from "./loadErrors.js";

const AI_PROMPT_CHARACTER_LIMIT = 500;
const AI_PROMPT_COUNTER_WARNING_AT = AI_PROMPT_CHARACTER_LIMIT - 50;
const AI_PROMPT_PLACEHOLDER_RESPONSE = "Got it. AI variant generation will use this prompt once connected.";

// Give the browser a paint before resolving the placeholder response so load mode is visible.
function waitForAiPromptFrame() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => resolve());
            return;
        }
        setTimeout(resolve, 0);
    });
}

async function requestAiPromptVariant(prompt) {
    // Tests and future API wiring can provide the real request implementation here.
    if (typeof globalThis.__MEMEBRO_AI_PROMPT_REQUEST__ === "function") {
        return globalThis.__MEMEBRO_AI_PROMPT_REQUEST__(prompt);
    }
    await waitForAiPromptFrame();
    return { text: AI_PROMPT_PLACEHOLDER_RESPONSE };
}

function getAiPromptCharacters(value) {
    return [...value];
}

export function renderAiPromptHistory({ dom, state }) {
    if (!dom.aiPromptHistory) return;
    const messages = state.aiPromptHistory.length
        ? state.aiPromptHistory
        : [{ role: "system", text: "Tell me what to change — caption, mood, style, or face-swap direction." }];

    dom.aiPromptHistory.innerHTML = "";
    messages.forEach((message) => {
        const node = document.createElement("article");
        node.className = `ai-prompt-message ai-prompt-message--${message.role}`;
        node.textContent = message.text;
        dom.aiPromptHistory.appendChild(node);
    });
    dom.aiPromptHistory.scrollTop = dom.aiPromptHistory.scrollHeight;
}

export function renderAiPromptLoadMode({ dom, state }) {
    const isBusy = state.aiPrompt?.requestState === "submitting";
    const errorCode = state.aiPrompt?.error?.code || "";
    const hasLoadState = isBusy || Boolean(errorCode);

    dom.aiPromptLoadMode?.classList.toggle("hidden", !hasLoadState);
    dom.aiPromptRetryCta?.classList.toggle("hidden", isBusy || !errorCode);

    if (!dom.aiPromptLoadMessage) return;
    dom.aiPromptLoadMessage.textContent = isBusy
        ? "Generating your meme variant…"
        : getLoadErrorMessage(state.aiPrompt?.error) || "Something went sideways. Retry when you are ready.";
}

export function configureAiPrompting({ dom, state, render }) {
    function enforceAiPromptCharacterLimit() {
        if (!dom.aiPromptInput) return 0;
        const characters = getAiPromptCharacters(dom.aiPromptInput.value);
        if (characters.length > AI_PROMPT_CHARACTER_LIMIT) {
            dom.aiPromptInput.value = characters.slice(0, AI_PROMPT_CHARACTER_LIMIT).join("");
            return AI_PROMPT_CHARACTER_LIMIT;
        }
        return characters.length;
    }

    function updateAiPromptCharacterCount(characterCount) {
        if (!dom.aiPromptWordCount) return;
        dom.aiPromptWordCount.textContent = `${characterCount} / ${AI_PROMPT_CHARACTER_LIMIT}`;
        // Keep the counter quiet until the user is close to the limit.
        dom.aiPromptWordCount.classList.toggle("hidden", characterCount < AI_PROMPT_COUNTER_WARNING_AT);
        dom.aiPromptWordCount.classList.toggle("is-at-limit", characterCount >= AI_PROMPT_CHARACTER_LIMIT);
    }

    function appendAiPromptMessage(role, text) {
        state.aiPromptHistory.push({ role, text });
    }

    function setPanelOpen(isOpen) {
        state.isAiPromptPanelOpen = isOpen;
        if (state.aiPrompt) state.aiPrompt.panelState = isOpen ? "open" : "closed";
        if (!isOpen) dom.uploadPage?.style.setProperty("--ai-prompt-keyboard-offset", "0px");
    }

    function syncKeyboardOffset() {
        if (!(state.aiPrompt?.panelState === "open" || state.isAiPromptPanelOpen)) return;
        // visualViewport reflects the on-screen keyboard on mobile browsers.
        const viewport = window.visualViewport;
        const keyboardOffset = viewport
            ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
            : 0;
        dom.uploadPage?.style.setProperty("--ai-prompt-keyboard-offset", `${Math.round(keyboardOffset)}px`);
    }

    function resizeInput() {
        if (!dom.aiPromptInput) return;
        dom.aiPromptInput.style.height = "auto";
        dom.aiPromptInput.style.height = `${dom.aiPromptInput.scrollHeight}px`;
    }

    function syncInputState() {
        const characterCount = enforceAiPromptCharacterLimit();
        updateAiPromptCharacterCount(characterCount);
        resizeInput();
    }

    function openPanel() {
        state.view = "ai_prompt";
        setPanelOpen(true);
        render();
        syncKeyboardOffset();
        syncInputState();
        dom.aiPromptInput?.focus();
    }

    function closePanel() {
        setPanelOpen(false);
        state.view = "templates";
        render();
    }

    function closePanelSilently() {
        // Used by callers that are already about to render their own state change.
        setPanelOpen(false);
    }

    function startRequest(prompt) {
        if (!state.aiPrompt) return;
        state.aiPrompt.requestState = "submitting";
        state.aiPrompt.lastPrompt = prompt;
        state.aiPrompt.error = null;
    }

    function finishRequest() {
        if (!state.aiPrompt) return;
        state.aiPrompt.requestState = "idle";
        state.aiPrompt.error = null;
    }

    function failRequest(error) {
        if (!state.aiPrompt) return;
        state.aiPrompt.requestState = "idle";
        state.aiPrompt.error = {
            code: error?.code || "AI_PROMPT_FAILED",
            message: error?.message || "AI generation had trouble. Retry when you are ready.",
        };
    }

    async function submitPrompt(event) {
        event.preventDefault();
        const prompt = dom.aiPromptInput?.value.trim();
        if (!prompt) return;

        startRequest(prompt);
        render();
        appendAiPromptMessage("user", prompt);

        try {
            const result = await requestAiPromptVariant(prompt);
            appendAiPromptMessage("assistant", result?.text || AI_PROMPT_PLACEHOLDER_RESPONSE);
            finishRequest();
            if (dom.aiPromptInput) dom.aiPromptInput.value = "";
        } catch (error) {
            failRequest(error);
        }

        syncInputState();
        render();
    }

    function retryPrompt() {
        if (!state.aiPrompt?.lastPrompt) return;
        state.aiPrompt.error = null;
        state.aiPrompt.requestState = "idle";
        if (dom.aiPromptInput) dom.aiPromptInput.value = state.aiPrompt.lastPrompt;
        syncInputState();
        render();
        dom.aiPromptForm?.requestSubmit();
    }

    function submitOnEnter(event) {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        dom.aiPromptForm?.requestSubmit();
    }

    window.visualViewport?.addEventListener("resize", syncKeyboardOffset);
    window.visualViewport?.addEventListener("scroll", syncKeyboardOffset);

    dom.aiPromptCta?.addEventListener("click", openPanel);
    dom.aiPromptCloseCta?.addEventListener("click", closePanel);
    dom.aiPromptInput?.addEventListener("focus", syncKeyboardOffset);
    dom.aiPromptInput?.addEventListener("blur", syncKeyboardOffset);
    dom.aiPromptInput?.addEventListener("input", syncInputState);
    dom.aiPromptInput?.addEventListener("keydown", submitOnEnter);
    dom.aiPromptForm?.addEventListener("submit", submitPrompt);
    dom.aiPromptRetryCta?.addEventListener("click", retryPrompt);

    return {
        closePanel,
        closePanelSilently,
        syncInputState,
        syncKeyboardOffset,
    };
}
