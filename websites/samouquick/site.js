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
