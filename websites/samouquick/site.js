// Progressive enhancements only: all content and controls work without scripts.
if ("IntersectionObserver" in window) {
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          entry.target.classList.add("shown");
          reveal.unobserve(entry.target);
        }
    },
    { threshold: 0.12 },
  );
  document
    .querySelectorAll(".reveal")
    .forEach((section) => reveal.observe(section));
}

// One fixed launch instant for every visitor; reloads never restart the timer.
const launchCard = document.querySelector("[data-launch-at]");
if (launchCard) {
  const deadline = Date.parse(launchCard.dataset.launchAt);
  let timer;
  const renderCountdown = () => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const values = {
      days: Math.floor(remaining / 86400),
      hours: Math.floor(remaining / 3600) % 24,
      minutes: Math.floor(remaining / 60) % 60,
      seconds: remaining % 60,
    };
    for (const [unit, value] of Object.entries(values))
      launchCard.querySelector(`[data-unit="${unit}"]`).textContent = String(
        value,
      ).padStart(2, "0");
    if (remaining === 0) {
      launchCard.querySelector(".launch-status").textContent =
        "وصلنا إلى موعد الإطلاق. تابع صفحاتنا لمعرفة آخر إعلان.";
      launchCard.querySelector("h3").textContent = "حان موعدنا";
      clearInterval(timer);
    }
    return remaining;
  };
  if (Number.isFinite(deadline) && renderCountdown() > 0)
    timer = setInterval(renderCountdown, 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderCountdown();
  });
}
