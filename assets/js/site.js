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

  const contactForm = document.querySelector("[data-contact-form]");
  const contactPreview = document.querySelector("[data-contact-preview]");
  if (contactForm && contactPreview) {
    function briefText() {
      const data = new FormData(contactForm);
      const value = (key) => String(data.get(key) || "").trim();
      return [
        "Hi Rifki,",
        "",
        `I'm reaching out about: ${value("projectType") || "[project type]"}`,
        "",
        "What needs to change:",
        value("goal") || "[current problem and target outcome]",
        "",
        `Timeline: ${value("timeline") || "To discuss"}`,
        `Indicative budget: ${value("budget") || "To discuss"}`,
        "",
        `Name: ${value("name") || "[name]"}`,
        `Company or team: ${value("company") || "-"}`,
        `Reply to: ${value("email") || "[email]"}`
      ].join("\n");
    }

    function updateBrief() {
      contactPreview.textContent = briefText();
    }

    contactForm.addEventListener("input", updateBrief);
    contactForm.addEventListener("change", updateBrief);
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!contactForm.reportValidity()) return;
      updateBrief();
      const email = String(contactForm.getAttribute("action") || "").replace(/^mailto:/i, "");
      const subject = "Project inquiry — " + String(new FormData(contactForm).get("projectType") || "Engineering work");
      const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(briefText())}`;
      const feedback = document.getElementById("contact-copy-feedback");
      if (feedback) feedback.textContent = `Your email app should open with the brief. Review and send it there. If it does not open, copy the brief and email ${email}.`;
      window.location.href = href;
    });
    updateBrief();
  }
})();
