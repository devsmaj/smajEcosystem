const feedbackTimers = new WeakMap();

export function showFeedbackPopup(element, message, type) {
    if (!element) return;

    const currentTimer = feedbackTimers.get(element);
    if (currentTimer) window.clearTimeout(currentTimer);

    element.textContent = message;
    element.dataset.status = type || "info";
    element.classList.toggle("feedback-popup", Boolean(message));
    element.classList.toggle("feedback-popup-visible", Boolean(message));

    if (!message) return;

    const timer = window.setTimeout(function () {
        element.classList.remove("feedback-popup-visible");
        window.setTimeout(function () {
            if (!element.classList.contains("feedback-popup-visible")) {
                element.classList.remove("feedback-popup");
                element.textContent = "";
                element.removeAttribute("data-status");
            }
        }, 200);
        feedbackTimers.delete(element);
    }, 3000);

    feedbackTimers.set(element, timer);
}
