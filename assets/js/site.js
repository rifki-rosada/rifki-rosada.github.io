(function () {
  function normalizePath(pathname) {
    if (!pathname) return "/";
    const clean = pathname.endsWith("/") ? pathname : pathname + "/";
    return clean.replace(/\/index\.html$/i, "/");
  }

  const currentPath = normalizePath(window.location.pathname);

  document.querySelectorAll("a[data-nav-link]").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("/")) return;
    if (normalizePath(href) === currentPath) {
      link.setAttribute("aria-current", "page");
    }
  });

  const navToggle = document.querySelector("[data-nav-toggle]");
  const mobileNav = document.querySelector("[data-mobile-nav]");

  function setMenuOpen(isOpen) {
    if (!navToggle || !mobileNav) return;
    navToggle.setAttribute("aria-expanded", String(isOpen));
    mobileNav.setAttribute("aria-hidden", String(!isOpen));
  }

  if (navToggle && mobileNav) {
    setMenuOpen(false);
    navToggle.addEventListener("click", () => {
      const expanded = navToggle.getAttribute("aria-expanded") === "true";
      setMenuOpen(!expanded);
    });

    mobileNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setMenuOpen(false));
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    });
  }

  const supportsClipboard = typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText;

  async function copyText(text) {
    if (supportsClipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const buffer = document.createElement("textarea");
    buffer.value = text;
    buffer.setAttribute("readonly", "");
    buffer.style.position = "absolute";
    buffer.style.left = "-9999px";
    document.body.appendChild(buffer);
    buffer.select();
    const success = document.execCommand("copy");
    document.body.removeChild(buffer);
    return success;
  }

  document.querySelectorAll("[data-copy-scope]").forEach((button) => {
    button.addEventListener("click", async () => {
      const sourceId = button.getAttribute("data-copy-scope");
      const sourceElement = sourceId ? document.getElementById(sourceId) : null;
      const target = button.getAttribute("data-copy-feedback");
      const feedbackElement = target ? document.getElementById(target) : null;

      if (!sourceElement) return;

      const text = sourceElement.innerText.trim();

      try {
        const copied = await copyText(text);
        if (!feedbackElement) return;
        feedbackElement.textContent = copied
          ? "Scope template copied. Paste it in your message and fill each line."
          : "Copy failed in this browser. You can still select and copy manually.";
      } catch (error) {
        if (feedbackElement) {
          feedbackElement.textContent = "Copy failed in this browser. You can still select and copy manually.";
        }
      }
    });
  });

  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
})();
