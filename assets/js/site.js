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

  window.RifkiLead = {
    async submit(endpoint, fields) {
      if (!endpoint.startsWith("https://formsubmit.co/ajax/")) {
        throw new Error("Lead submission is not configured.");
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            ...fields,
            _captcha: "false",
            _template: "table",
            _url: window.location.href
          }),
          signal: controller.signal
        });
        const result = await response.json();
        if (!response.ok || result.success !== "true" && result.success !== true) {
          throw new Error("The submission service did not accept the request.");
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  };

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
    const submitButton = contactForm.querySelector('[type="submit"]');
    const status = contactForm.querySelector("[data-contact-status]");
    const fallback = contactForm.querySelector("[data-contact-mailto]");
    let submitting = false;
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
        `Location: ${value("location") || "To discuss"}`,
        `Tools or integrations: ${value("integrations") || "To discuss"}`,
        `Users or complexity: ${value("complexity") || "To discuss"}`,
        `Timeline: ${value("timeline") || "To discuss"}`,
        `Indicative budget: ${value("budget") || "To discuss"}`,
        "",
        `Name: ${value("name") || "[name]"}`,
        `Company or team: ${value("company") || "-"}`,
        `Reply to: ${value("email") || "[email]"}`,
        `WhatsApp: ${value("whatsapp") || "-"}`,
        `Source URL: ${window.location.href}`
      ].join("\n");
    }

    function updateBrief() {
      contactPreview.textContent = briefText();
    }

    contactForm.addEventListener("input", updateBrief);
    contactForm.addEventListener("change", updateBrief);
    contactForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (submitting) return;
      if (!contactForm.reportValidity()) return;
      updateBrief();
      const data = new FormData(contactForm);
      if (String(data.get("_honey") || "").trim()) return;
      if (!String(data.get("name") || "").trim() || !String(data.get("goal") || "").trim()) {
        if (status) { status.hidden = false; status.textContent = "Add your name and a short description of the project."; }
        return;
      }
      const whatsapp = String(data.get("whatsapp") || "").trim();
      if (whatsapp && (!/^[+()\d\s-]+$/.test(whatsapp) || whatsapp.replace(/\D/g, "").length < 7)) {
        if (status) { status.hidden = false; status.textContent = "Enter a valid WhatsApp number or leave it blank."; }
        contactForm.elements.whatsapp.focus();
        return;
      }
      const href = `mailto:${contactForm.dataset.contactEmail}?subject=${encodeURIComponent("Project inquiry — " + data.get("projectType"))}&body=${encodeURIComponent(briefText())}`;
      if (fallback) fallback.href = href;
      submitting = true;
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
      if (status) { status.hidden = false; status.textContent = "Sending your project brief..."; }
      try {
        await window.RifkiLead.submit(contactForm.dataset.leadEndpoint, {
          _subject: "New project inquiry from rifkirosada.com",
          _honey: "",
          name: String(data.get("name") || "").trim(),
          email: String(data.get("email") || "").trim(),
          company: String(data.get("company") || "").trim(),
          whatsapp,
          location: String(data.get("location") || "").trim(),
          project_type: String(data.get("projectType") || "").trim(),
          goal: String(data.get("goal") || "").trim(),
          integrations: String(data.get("integrations") || "").trim(),
          complexity: String(data.get("complexity") || "").trim(),
          timeline: String(data.get("timeline") || "").trim(),
          budget: String(data.get("budget") || "").trim(),
          message: briefText()
        });
        if (status) status.textContent = "Received. I review project briefs within 24 hours on weekdays.";
        submitButton.textContent = "Brief received";
        if (fallback) fallback.hidden = true;
      } catch {
        if (status) status.textContent = "Your brief could not be sent. Please try again or use the email fallback below.";
        if (fallback) fallback.hidden = false;
        submitButton.disabled = false;
        submitButton.textContent = "Try sending again";
      } finally {
        submitting = false;
      }
    });
    updateBrief();
  }
})();
