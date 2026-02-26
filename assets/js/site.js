(function () {
  function normalizePath(pathname) {
    if (!pathname) return "/";
    const clean = pathname.endsWith("/") ? pathname : pathname + "/";
    return clean.replace(/\/index\.html$/i, "/");
  }

  const currentPath = normalizePath(window.location.pathname);

  document.querySelectorAll("a[data-nav-link]").forEach((link) => {
    if (link.getAttribute("aria-current") === "page") return;
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("/")) return;
    const normalized = normalizePath(href);
    if ((normalized === "/" && currentPath === "/") || (normalized !== "/" && currentPath.startsWith(normalized))) {
      link.setAttribute("aria-current", "page");
    }
  });

  const navToggle = document.querySelector("[data-nav-toggle]");
  const mobileNav = document.querySelector("[data-mobile-nav]");

  function setMenuState(open) {
    if (!navToggle || !mobileNav) return;
    navToggle.setAttribute("aria-expanded", String(open));
    mobileNav.setAttribute("aria-hidden", String(!open));
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
      const clickInsideMenu = mobileNav.contains(event.target);
      const clickToggle = navToggle.contains(event.target);
      if (!clickInsideMenu && !clickToggle) {
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
      const text = source.innerText.trim();

      try {
        const ok = await copyText(text);
        if (feedback) {
          feedback.textContent = ok
            ? "Copied. Paste and edit before sending."
            : "Copy failed in this browser. Please copy manually.";
        }
      } catch {
        if (feedback) {
          feedback.textContent = "Copy failed in this browser. Please copy manually.";
        }
      }
    });
  });

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
})();