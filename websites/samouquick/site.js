const reduced = matchMedia("(prefers-reduced-motion: reduce)");
if ("IntersectionObserver" in window) {
  const reveal = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("shown");
          reveal.unobserve(entry.target);
        }
      }),
    { threshold: 0.12 },
  );
  document
    .querySelectorAll(".reveal")
    .forEach((section) => reveal.observe(section));
}
const track = document.querySelector(".slides");
const slides = [...document.querySelectorAll(".slide")];
const dots = [...document.querySelectorAll("[data-slide]")];
const pause = document.querySelector(".pause");
let active = 0,
  stopped = true,
  hovered = false,
  timer;
function display(index) {
  active = index;
  dots.forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
    dot.setAttribute("aria-pressed", String(i === index));
  });
}
function go(index) {
  const next = (index + slides.length) % slides.length;
  track.scrollBy({
    behavior: reduced.matches ? "instant" : "smooth",
    left:
      slides[next].getBoundingClientRect().left -
      track.getBoundingClientRect().left,
  });
  display(next);
}
function schedule() {
  clearInterval(timer);
  pause.textContent = stopped ? "تشغيل" : "إيقاف";
  pause.setAttribute(
    "aria-label",
    stopped ? "تشغيل العرض التلقائي" : "إيقاف العرض التلقائي",
  );
  if (!stopped && !hovered && !document.hidden)
    timer = setInterval(() => {
      const r = track.getBoundingClientRect();
      if (
        r.top < innerHeight &&
        r.bottom > 0 &&
        !track.closest(".carousel").contains(document.activeElement)
      )
        go(active + 1);
    }, 6500);
}
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((entry) => {
      if (entry.isIntersecting) display(slides.indexOf(entry.target));
    }),
  { root: track, threshold: 0.65 },
);
slides.forEach((slide) => observer.observe(slide));
dots.forEach((dot, i) =>
  dot.addEventListener("click", () => {
    go(i);
    schedule();
  }),
);
document.querySelector(".next").addEventListener("click", () => {
  go(active + 1);
  schedule();
});
document.querySelector(".previous").addEventListener("click", () => {
  go(active - 1);
  schedule();
});
pause.addEventListener("click", () => {
  stopped = !stopped;
  schedule();
});
track.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    go(active + (event.key === "ArrowLeft" ? 1 : -1));
  }
});
track.addEventListener("pointerenter", () => {
  hovered = true;
  schedule();
});
track.addEventListener("pointerleave", () => {
  hovered = false;
  schedule();
});
track.addEventListener(
  "pointerdown",
  () => {
    stopped = true;
    schedule();
  },
  { passive: true },
);
document.addEventListener("visibilitychange", schedule);
reduced.addEventListener("change", () => {
  stopped = reduced.matches;
  schedule();
});
schedule();
