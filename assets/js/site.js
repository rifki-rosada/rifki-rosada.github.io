(function () {
  const navToggle = document.querySelector("[data-nav-toggle]");
  const mobileNav = document.querySelector("[data-mobile-nav]");

  function setMenuState(open) {
    if (!navToggle || !mobileNav) return;

    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    mobileNav.setAttribute("aria-hidden", String(!open));
    mobileNav.hidden = !open;
  }

  if (navToggle && mobileNav) {
    setMenuState(false);

    navToggle.addEventListener("click", function () {
      const expanded = navToggle.getAttribute("aria-expanded") === "true";
      setMenuState(!expanded);
    });

    mobileNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", function () {
        setMenuState(false);
      });
    });

    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setMenuState(false);
      }
    });

    document.addEventListener("click", function (event) {
      if (!(event.target instanceof Element)) return;
      if (!mobileNav.contains(event.target) && !navToggle.contains(event.target)) {
        setMenuState(false);
      }
    });
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "true");
    fallback.style.position = "absolute";
    fallback.style.left = "-9999px";
    document.body.appendChild(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(fallback);
    return copied;
  }

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async function () {
      const sourceId = button.getAttribute("data-copy-target");
      const feedbackId = button.getAttribute("data-copy-feedback");
      const source = sourceId ? document.getElementById(sourceId) : null;
      const feedback = feedbackId ? document.getElementById(feedbackId) : null;

      if (!source) return;

      try {
        const ok = await copyText(source.innerText.trim());
        if (feedback) {
          feedback.textContent = ok
            ? "Copied. Edit the message before sending."
            : "Copy failed in this browser. Please copy manually.";
        }
      } catch {
        if (feedback) {
          feedback.textContent = "Copy failed in this browser. Please copy manually.";
        }
      }
    });
  });
})();
