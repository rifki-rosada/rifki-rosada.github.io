(function () {
  const form = document.querySelector("[data-estimate-form]");
  if (!form) return;

  const contactForm = document.querySelector("[data-estimate-contact-form]");
  const resultSection = document.querySelector("[data-estimate-result-section]");
  const formError = document.querySelector("[data-estimate-error]");
  const submitStatus = document.querySelector("[data-estimate-submit-status]");
  const payloadPreview = document.querySelector("[data-estimate-payload-preview]");
  const finalSubmitButton = document.querySelector("[data-estimate-submit]");
  const editButton = document.querySelector("[data-estimate-edit]");
  const mailtoLink = document.querySelector("[data-estimate-mailto]");
  const mailtoTriggers = document.querySelectorAll("[data-estimate-mailto], [data-estimate-mailto-trigger]");
  const steps = Array.from(form.querySelectorAll("[data-estimate-step]"));
  const prevButton = form.querySelector("[data-estimate-prev]");
  const nextButton = form.querySelector("[data-estimate-next]");
  const showResultButton = form.querySelector("[data-estimate-show-result]");
  const progressLabel = form.querySelector("[data-estimate-progress-label]");
  const progressTitle = form.querySelector("[data-estimate-progress-title]");
  const progressBar = form.querySelector("[data-estimate-progress-bar]");
  const summaryNodes = Array.from(document.querySelectorAll("[data-summary]")).reduce((map, node) => {
    map[node.getAttribute("data-summary")] = {
      node,
      placeholder: node.textContent
    };
    return map;
  }, {});
  const config = readConfig();
  const estimateContent = readEstimateData();
  const submitCooldownMs = 60000;
  const questionMap = buildQuestionMap(estimateContent.questions);
  const optionLabelMap = buildOptionLabelMap(estimateContent.questions);
  const analyticsEvents = estimateContent.analytics?.events || {};

  let currentEstimateData = null;
  let currentPayload = null;
  let isSubmitting = false;
  let hasTrackedStart = false;
  let currentStepIndex = 0;

  form.addEventListener("change", function (event) {
    if (!hasTrackedStart) {
      trackEvent(analyticsEvents.start || "estimate_start");
      hasTrackedStart = true;
    }
    if (event.target && event.target.name === "location") {
      updateBudgetLabels();
    }
    updateSummary();
  });

  form.addEventListener("input", function () {
    if (!hasTrackedStart) {
      trackEvent(analyticsEvents.start || "estimate_start");
      hasTrackedStart = true;
    }
    updateSummary();
  });

  prevButton?.addEventListener("click", function () {
    clearMessage(formError);
    setCurrentStep(currentStepIndex - 1, { scroll: true });
  });

  nextButton?.addEventListener("click", function () {
    clearMessage(formError);
    const validation = validateStep(currentStepIndex);
    if (!validation.valid) {
      showEstimateValidation(validation);
      return;
    }
    setCurrentStep(currentStepIndex + 1, { scroll: true });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearMessage(formError);
    clearMessage(submitStatus);

    const collected = collectEstimateData();
    const validation = validateEstimate(collected);
    if (!validation.valid) {
      showEstimateValidation(validation);
      return;
    }

    const estimate = calculateEstimate(collected);
    currentEstimateData = { answers: collected, estimate };
    currentPayload = buildPayload(collected, estimate, collectContactData());
    renderResult(currentPayload);
    updateMailto(currentPayload);
    resultSection.hidden = false;
    form.hidden = true;
    updateSummary(currentPayload);
    trackEvent(analyticsEvents.result || "estimate_result_view", publicEventPayload(currentPayload));
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  contactForm?.addEventListener("input", function () {
    if (!currentEstimateData) return;
    currentPayload = buildPayload(currentEstimateData.answers, currentEstimateData.estimate, collectContactData());
    updateMailto(currentPayload);
  });

  finalSubmitButton?.addEventListener("click", async function () {
    if (!currentEstimateData || isSubmitting) return;
    clearMessage(submitStatus);

    const contact = collectContactData();
    const validation = validateContact(contact);
    if (!validation.valid) {
      showMessage(submitStatus, validation.message);
      focusTarget(validation.target);
      return;
    }

    currentEstimateData.estimate = applyContactLeadScore(
      currentEstimateData.estimate,
      currentEstimateData.answers,
      contact
    );
    currentPayload = buildPayload(currentEstimateData.answers, currentEstimateData.estimate, contact);
    updateMailto(currentPayload);
    trackEvent(analyticsEvents.submitClick || "estimate_submit_click", publicEventPayload(currentPayload));

    const cooldownRemaining = getCooldownRemaining();
    if (cooldownRemaining > 0) {
      showMessage(submitStatus, `Please wait ${Math.ceil(cooldownRemaining / 1000)} seconds before submitting again.`);
      return;
    }

    if (!config.webhookEndpoint) {
      showMessage(submitStatus, "Online submission is not configured yet. Use Email Project Brief to send the same summary.");
      trackEvent(analyticsEvents.mailtoFallback || "estimate_mailto_fallback", publicEventPayload(currentPayload));
      return;
    }

    isSubmitting = true;
    finalSubmitButton.disabled = true;
    showMessage(submitStatus, "Sending estimate request...");

    try {
      await postToWebhook(config.webhookEndpoint, currentPayload);
      setLastSubmittedAt();
      showMessage(submitStatus, "Sent. I will review the estimate request and reply with the best next step.");
      trackEvent(analyticsEvents.submitSuccess || "estimate_submit_success", publicEventPayload(currentPayload));
    } catch {
      showMessage(submitStatus, "Online submission was unavailable. Use Email Project Brief to send the same summary.");
      finalSubmitButton.disabled = false;
      trackEvent(analyticsEvents.submitError || "estimate_submit_error", publicEventPayload(currentPayload));
    } finally {
      isSubmitting = false;
    }
  });

  editButton?.addEventListener("click", function () {
    resultSection.hidden = true;
    form.hidden = false;
    setCurrentStep(Math.max(steps.length - 1, 0));
    clearMessage(submitStatus);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  mailtoTriggers.forEach((link) => {
    link.addEventListener("click", function () {
      if (currentEstimateData) {
        currentPayload = buildPayload(currentEstimateData.answers, currentEstimateData.estimate, collectContactData());
        updateMailto(currentPayload);
      }
      trackEvent(analyticsEvents.mailtoFallback || "estimate_mailto_fallback", currentPayload ? publicEventPayload(currentPayload) : {});
    });
  });

  document.querySelectorAll("[data-estimate-proof-link]").forEach((link) => {
    link.addEventListener("click", function () {
      trackEvent(analyticsEvents.proofClick || "proof_click", {
        label: sanitizeText(link.textContent || "", 120),
        href: sanitizeText(link.getAttribute("href") || "", 180)
      });
    });
  });

  updateBudgetLabels();
  setupStepper();
  updateSummary();

  function readConfig() {
    const node = document.getElementById("estimate-config");
    if (!node) {
      return { webhookEndpoint: "", contactEmail: "", source: "portfolio_estimate" };
    }

    try {
      const parsed = JSON.parse(node.textContent || "{}");
      return {
        webhookEndpoint: sanitizeUrl(parsed.webhookEndpoint || ""),
        contactEmail: sanitizeEmail(parsed.contactEmail || ""),
        source: sanitizeText(parsed.source || "portfolio_estimate", 80)
      };
    } catch {
      return { webhookEndpoint: "", contactEmail: "", source: "portfolio_estimate" };
    }
  }

  function readEstimateData() {
    const fallback = {
      pricing: { indonesia: [], international: [] },
      questions: [],
      contact: {},
      result: {},
      sidePanel: {},
      disclaimer: "",
      scoring: {},
      analytics: {}
    };
    const node = document.getElementById("estimate-data");
    if (!node) return fallback;

    try {
      return { ...fallback, ...JSON.parse(node.textContent || "{}") };
    } catch {
      return fallback;
    }
  }

  function setupStepper() {
    if (steps.length === 0) {
      if (prevButton) prevButton.hidden = true;
      if (nextButton) nextButton.hidden = true;
      if (showResultButton) showResultButton.hidden = false;
      return;
    }
    setCurrentStep(0);
  }

  function setCurrentStep(index, options = {}) {
    const nextIndex = Math.min(Math.max(index, 0), Math.max(steps.length - 1, 0));
    currentStepIndex = nextIndex;

    steps.forEach((step, stepIndex) => {
      step.hidden = stepIndex !== currentStepIndex;
    });

    const isFirst = currentStepIndex === 0;
    const isLast = currentStepIndex === steps.length - 1;
    if (prevButton) prevButton.disabled = isFirst;
    if (nextButton) nextButton.hidden = isLast;
    if (showResultButton) showResultButton.hidden = !isLast;
    if (progressLabel) progressLabel.textContent = `Step ${currentStepIndex + 1} of ${steps.length}`;
    if (progressTitle) {
      progressTitle.textContent =
        steps[currentStepIndex]?.getAttribute("data-estimate-step-title") || `Pre-audit step ${currentStepIndex + 1}`;
    }
    if (progressBar) {
      progressBar.style.width = `${((currentStepIndex + 1) / Math.max(steps.length, 1)) * 100}%`;
    }
    if (options.scroll) {
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function validateStep(stepIndex) {
    const data = collectEstimateData();
    if (data.website) {
      return { valid: false, message: "Unable to process this request.", target: targetFor("location") };
    }

    const questions = estimateContent.questions?.[stepIndex]?.questions || [];
    for (const question of questions) {
      const validation = validateQuestion(question, data);
      if (!validation.valid) return validation;
    }

    return { valid: true, message: "" };
  }

  function validateQuestion(question, data) {
    if (!question?.required) return { valid: true, message: "" };
    if (question.name === "automationNeeds" && data.automationNeeds.length === 0) {
      return {
        valid: false,
        message: "Choose at least one automation need.",
        target: targetFor("automationNeeds")
      };
    }
    if (!data[question.name]) {
      return {
        valid: false,
        message: validationMessageFor(question.name, question.label),
        target: targetFor(question.name)
      };
    }
    return { valid: true, message: "" };
  }

  function validationMessageFor(name, label) {
    const messages = {
      location: "Choose the business location.",
      businessType: "Choose the business type.",
      currentProcess: "Choose the current process.",
      teamSize: "Choose the number of users or team members.",
      integrations: "Choose the number of integrations.",
      dataComplexity: "Choose the data complexity.",
      urgency: "Choose the urgency.",
      budgetReadiness: "Choose the budget readiness.",
      projectDescription: "Add a short project description."
    };
    return messages[name] || `Complete ${String(label || "this question").toLowerCase()}.`;
  }

  function showEstimateValidation(validation) {
    const stepIndex = stepIndexForTarget(validation.target);
    if (stepIndex >= 0) {
      setCurrentStep(stepIndex);
    }
    showMessage(formError, validation.message);
    focusTarget(validation.target);
  }

  function stepIndexForTarget(target) {
    const element = firstElementFromTarget(target);
    const step = element?.closest?.("[data-estimate-step]");
    if (!step) return -1;
    return steps.indexOf(step);
  }

  function targetFor(name) {
    const field = form.elements[name];
    if (!field) return null;
    return firstElementFromTarget(field);
  }

  function firstElementFromTarget(target) {
    if (!target) return null;
    if (typeof target.focus === "function") return target;
    if (typeof target.length === "number") return Array.from(target).find(Boolean) || null;
    return null;
  }

  function focusTarget(target) {
    const element = firstElementFromTarget(target);
    element?.focus?.({ preventScroll: true });
  }

  function buildQuestionMap(sections) {
    const map = {};
    (sections || []).forEach((section) => {
      (section.questions || []).forEach((question) => {
        map[question.name] = question;
      });
    });
    return map;
  }

  function buildOptionLabelMap(sections) {
    const map = {};
    (sections || []).forEach((section) => {
      (section.questions || []).forEach((question) => {
        map[question.name] = {};
        (question.options || []).forEach((option) => {
          map[question.name][option.value] = option.label;
        });
      });
    });
    return map;
  }

  function sanitizeUrl(value) {
    const text = String(value || "").trim();
    return text.startsWith("https://") ? text : "";
  }

  function sanitizeText(value, maxLength) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
  }

  function sanitizeLongText(value, maxLength) {
    return String(value || "")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
      .replace(/[<>]/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, maxLength);
  }

  function sanitizeEmail(value) {
    return String(value || "").trim().toLowerCase().slice(0, 160);
  }

  function valueFor(scope, name) {
    const field = scope?.elements?.[name];
    if (!field) return "";
    if (field instanceof RadioNodeList) {
      return sanitizeText(field.value, 180);
    }
    return sanitizeText(field.value, 180);
  }

  function checkedValues(name) {
    return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((item) => sanitizeText(item.value, 160));
  }

  function collectEstimateData() {
    return {
      location: valueFor(form, "location"),
      businessType: valueFor(form, "businessType"),
      automationNeeds: checkedValues("automationNeeds"),
      currentProcess: valueFor(form, "currentProcess"),
      teamSize: valueFor(form, "teamSize"),
      integrations: valueFor(form, "integrations"),
      dataComplexity: valueFor(form, "dataComplexity"),
      urgency: valueFor(form, "urgency"),
      budgetReadiness: valueFor(form, "budgetReadiness"),
      projectDescription: sanitizeLongText(form.elements.projectDescription?.value || "", 1800),
      website: sanitizeText(valueFor(form, "website"), 120)
    };
  }

  function collectContactData() {
    return {
      name: sanitizeText(valueFor(contactForm, "name"), 120),
      company: sanitizeText(valueFor(contactForm, "company"), 140),
      email: sanitizeEmail(valueFor(contactForm, "email")),
      whatsapp: sanitizeText(valueFor(contactForm, "whatsapp"), 100)
    };
  }

  function validateEstimate(data) {
    if (data.website) {
      return { valid: false, message: "Unable to process this request.", target: targetFor("location") };
    }

    const required = [
      ["location", "Choose the business location."],
      ["businessType", "Choose the business type."],
      ["currentProcess", "Choose the current process."],
      ["teamSize", "Choose the number of users or team members."],
      ["integrations", "Choose the number of integrations."],
      ["dataComplexity", "Choose the data complexity."],
      ["urgency", "Choose the urgency."],
      ["budgetReadiness", "Choose the budget readiness."],
      ["projectDescription", "Add a short project description."]
    ];

    for (const [field, message] of required) {
      if (!data[field]) {
        return { valid: false, message, target: targetFor(field) };
      }
    }

    if (data.automationNeeds.length === 0) {
      return {
        valid: false,
        message: "Choose at least one automation need.",
        target: targetFor("automationNeeds")
      };
    }

    return { valid: true, message: "" };
  }

  function validateContact(data) {
    if (!data.name) {
      return { valid: false, message: "Enter your name.", target: contactForm?.elements.name };
    }
    if (!data.email && !data.whatsapp) {
      return {
        valid: false,
        message: "Add either an email address or WhatsApp contact.",
        target: contactForm?.elements.email
      };
    }
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return { valid: false, message: "Enter a valid email address.", target: contactForm?.elements.email };
    }
    return { valid: true, message: "" };
  }

  function calculateEstimate(data) {
    const complexityPoints = calculateComplexityPoints(data);
    const lead = calculateLeadScore(data);
    const packageInfo = choosePackage(data, complexityPoints, lead);
    const complexityLevel = complexityLabel(complexityPoints);

    return {
      packageId: packageInfo.id,
      package: packageInfo.name,
      range: packageInfo.range,
      timeline: packageInfo.timeline,
      complexityLevel,
      complexityPoints,
      leadScore: lead.score,
      leadScorePoints: lead.points,
      leadSignals: lead.goodSignals,
      lowFitSignals: lead.lowSignals,
      explanation: explanationFor(data, packageInfo, complexityLevel, lead)
    };
  }

  function applyContactLeadScore(estimate, data, contact) {
    const lead = calculateLeadScore(data, contact);
    return {
      ...estimate,
      leadScore: lead.score,
      leadScorePoints: lead.points,
      leadSignals: lead.goodSignals,
      lowFitSignals: lead.lowSignals
    };
  }

  function calculateComplexityPoints(data) {
    let points = 0;
    const complexNeeds = estimateContent.scoring?.complexNeeds || [];
    const workflowNeeds = ["crm-sales-pipeline", "owner-manager-dashboard", "invoice-payment-checking", "whatsapp-customer-service"];

    if (data.automationNeeds.length >= 3) points += 1;
    if (data.automationNeeds.length >= 5) points += 1;
    if (data.automationNeeds.some((need) => complexNeeds.includes(need))) points += 2;
    if (data.automationNeeds.some((need) => workflowNeeds.includes(need))) points += 1;

    points += { none: 0, "1-2": 1, "3-5": 3, "more-than-5": 4 }[data.integrations] || 0;
    points += { "1-3": 0, "4-10": 1, "11-30": 2, "31-100": 3, "100-plus": 4 }[data.teamSize] || 0;
    points += {
      "simple-form-input": 0,
      "spreadsheet-database": 1,
      "multiple-sources": 2,
      "cleaning-matching-validation": 3,
      "ai-ocr-document-understanding": 4
    }[data.dataComplexity] || 0;

    if (data.currentProcess === "using-existing-crm-tools") points += 1;
    if (["custom-system-messy", "need-existing-system-integration"].includes(data.currentProcess)) points += 2;
    if (["within-2-weeks", "asap-urgent"].includes(data.urgency)) points += 1;

    return points;
  }

  function choosePackage(data, complexityPoints, lead) {
    const market = data.location === "international" ? "international" : "indonesia";
    const packages = estimateContent.pricing?.[market] || estimateContent.pricing?.indonesia || [];
    const audit = packages[0] || {};

    if (
      ["below-minimum", "starter"].includes(data.budgetReadiness) ||
      lead.score === "LOW FIT" ||
      lead.lowSignals.some((signal) => ["Vague project description", "Student or personal project wording", "Clone app or generic app idea"].includes(signal))
    ) {
      return audit;
    }

    let index = 1;
    if (complexityPoints >= 8) index = 2;
    if (complexityPoints >= 12) index = 3;

    const budgetFloor = { mvp: 1, system: 2, advanced: 3 }[data.budgetReadiness];
    if (typeof budgetFloor === "number") {
      index = Math.max(index, budgetFloor);
    }

    return packages[Math.min(index, packages.length - 1)] || audit;
  }

  function complexityLabel(points) {
    const labels = estimateContent.scoring?.complexityLabels || [];
    const found = labels.find((item) => points >= Number(item.min || 0));
    if (found) return found.label;
    if (points >= 12) return "Advanced complexity";
    if (points >= 8) return "High complexity";
    if (points >= 4) return "Moderate complexity";
    return "Low complexity";
  }

  function calculateLeadScore(data, contact = {}) {
    let points = 0;
    const goodSignals = [];
    const lowSignals = [];
    const description = data.projectDescription.toLowerCase();
    const clearPain = hasClearPainPoint(description);
    const lowFitText = hasLowFitText(description);
    const highFitNeeds = estimateContent.scoring?.highFitNeeds || [];
    const goodNeed = data.automationNeeds.some((need) => highFitNeeds.includes(need));

    if (data.location === "international") {
      points += 2;
      goodSignals.push("Outside Indonesia");
    }
    if (["mvp", "system", "advanced"].includes(data.budgetReadiness)) {
      points += 2;
      goodSignals.push("Budget at or above core project range");
    }
    if (["system", "advanced"].includes(data.budgetReadiness)) {
      points += 1;
      goodSignals.push("Budget ready for internal system scope");
    }
    if (!["mostly-manual"].includes(data.currentProcess)) {
      points += 2;
      goodSignals.push("Existing workflow or tool context");
    }
    if (["4-10", "11-30", "31-100", "100-plus"].includes(data.teamSize)) {
      points += 1;
      goodSignals.push("Team size above 3");
    }
    if (clearPain) {
      points += 2;
      goodSignals.push("Clear project pain");
    }
    if (["within-1-month", "within-2-weeks", "asap-urgent"].includes(data.urgency)) {
      points += 1;
      goodSignals.push("Near-term timeline");
    }
    if (goodNeed) {
      points += 2;
      goodSignals.push("High-fit automation need");
    }
    if (contact.company) {
      points += 1;
      goodSignals.push("Company provided");
    }

    if (data.budgetReadiness === "below-minimum") {
      points -= 4;
      lowSignals.push("Below minimum budget");
    }
    const contactWasProvided = Boolean(contact.name || contact.email || contact.whatsapp || contact.company);
    if (contactWasProvided && !contact.company) {
      points -= 1;
      lowSignals.push("No company provided");
    }
    if (!clearPain) {
      points -= 2;
      lowSignals.push("Vague project description");
    }
    if (lowFitText.student) {
      points -= 3;
      lowSignals.push("Student or personal project wording");
    }
    if (lowFitText.clone) {
      points -= 3;
      lowSignals.push("Clone app or generic app idea");
    }

    const labels = estimateContent.scoring?.leadLabels || {};
    let score = labels.medium || "MEDIUM FIT";
    if (points >= 8 && !lowSignals.includes("Below minimum budget") && !lowFitText.student && !lowFitText.clone) {
      score = labels.high || "HIGH FIT";
    } else if (points < 4 || lowSignals.includes("Vague project description") || lowFitText.student || lowFitText.clone) {
      score = labels.low || "LOW FIT";
    }

    return { score, points, goodSignals, lowSignals };
  }

  function hasClearPainPoint(text) {
    if (text.length >= 90) return true;
    const keywords = estimateContent.scoring?.clearPainKeywords || [];
    return keywords.some((keyword) => text.includes(String(keyword).toLowerCase()));
  }

  function hasLowFitText(text) {
    return {
      student: /(student|personal project|homework|assignment)/i.test(text),
      clone: /(clone app|app clone|generic app idea|like uber|like gojek|like tokopedia)/i.test(text)
    };
  }

  function explanationFor(data, packageInfo, complexityLevel, lead) {
    const needLabels = data.automationNeeds
      .slice(0, 3)
      .map((need) => labelFor("automationNeeds", need).toLowerCase());
    const needs = joinReadable(needLabels);
    const base = needs ? `Your project includes ${needs}.` : "Your project includes a workflow automation scope.";
    const detail = estimateContent.result?.defaultExplanation || "The estimate depends on integration access, data quality, approval flow, and rollout constraints.";
    const auditNote = packageInfo.id === "audit" || lead.score === "LOW FIT" ? ` ${estimateContent.result?.lowFitNote || ""}` : "";
    return `${base} ${detail}${auditNote}`.trim();
  }

  function joinReadable(items) {
    if (items.length <= 1) return items.join("");
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
  }

  function buildPayload(data, estimate, contact) {
    const submittedAt = new Date().toISOString();
    const market = data.location === "international" ? "international" : "indonesia";
    const utm = captureTrackingFields();
    const selectedAnswers = {
      location: data.location,
      businessType: data.businessType,
      automationNeeds: data.automationNeeds,
      currentProcess: data.currentProcess,
      teamSize: data.teamSize,
      integrations: data.integrations,
      dataComplexity: data.dataComplexity,
      urgency: data.urgency,
      budgetReadiness: data.budgetReadiness
    };
    const selectedAnswerLabels = {
      location: labelFor("location", data.location),
      businessType: labelFor("businessType", data.businessType),
      automationNeeds: data.automationNeeds.map((need) => labelFor("automationNeeds", need)),
      currentProcess: labelFor("currentProcess", data.currentProcess),
      teamSize: labelFor("teamSize", data.teamSize),
      integrations: labelFor("integrations", data.integrations),
      dataComplexity: labelFor("dataComplexity", data.dataComplexity),
      urgency: labelFor("urgency", data.urgency),
      budgetReadiness: selectedBudgetLabel(data)
    };

    return {
      submittedAt,
      source: config.source || "portfolio_estimate",
      sourcePage: "estimate",
      pageUrl: window.location.href,
      currentUrl: window.location.href,
      utm,
      selectedAnswers,
      selectedAnswerLabels,
      market,
      currency: market === "international" ? "USD" : "IDR",
      location: data.location,
      locationLabel: selectedAnswerLabels.location,
      businessType: data.businessType,
      businessTypeLabel: selectedAnswerLabels.businessType,
      automationNeeds: data.automationNeeds.join(", "),
      automationNeedLabels: selectedAnswerLabels.automationNeeds.join(", "),
      currentProcess: data.currentProcess,
      currentProcessLabel: selectedAnswerLabels.currentProcess,
      teamSize: data.teamSize,
      teamSizeLabel: selectedAnswerLabels.teamSize,
      integrations: data.integrations,
      integrationsLabel: selectedAnswerLabels.integrations,
      dataComplexity: data.dataComplexity,
      dataComplexityLabel: selectedAnswerLabels.dataComplexity,
      urgency: data.urgency,
      urgencyLabel: selectedAnswerLabels.urgency,
      budgetReadiness: data.budgetReadiness,
      budgetReadinessLabel: selectedAnswerLabels.budgetReadiness,
      recommendedPackage: estimate.package,
      recommendedPackageId: estimate.packageId,
      estimatedRange: estimate.range,
      estimatedTimeline: estimate.timeline,
      complexityScore: estimate.complexityPoints,
      complexityLabel: estimate.complexityLevel,
      leadFitScore: estimate.leadScorePoints,
      leadFitLabel: estimate.leadScore,
      leadSignals: estimate.leadSignals,
      lowFitSignals: estimate.lowFitSignals,
      estimateExplanation: estimate.explanation,
      name: contact.name,
      company: contact.company,
      email: contact.email,
      whatsapp: contact.whatsapp,
      projectDescription: data.projectDescription,
      webhookConfigured: Boolean(config.webhookEndpoint)
    };
  }

  function captureTrackingFields() {
    const params = new URLSearchParams(window.location.search);
    const keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "msclkid"];
    const output = {};
    keys.forEach((key) => {
      output[key] = sanitizeText(params.get(key) || "", 220);
    });
    return output;
  }

  function labelFor(name, value) {
    return sanitizeText(optionLabelMap[name]?.[value] || value, 180);
  }

  function selectedBudgetLabel(data) {
    const input = Array.from(form.querySelectorAll('input[name="budgetReadiness"]')).find(
      (item) => item.value === data.budgetReadiness
    );
    const label = input?.closest(".estimate-option")?.querySelector("[data-budget-label]");
    return sanitizeText(label?.textContent || labelFor("budgetReadiness", data.budgetReadiness), 140);
  }

  function updateSummary(payload = null) {
    if (Object.keys(summaryNodes).length === 0) return;
    const data = payload?.selectedAnswers
      ? {
          location: payload.location,
          businessType: payload.businessType,
          automationNeeds: payload.selectedAnswers.automationNeeds || [],
          currentProcess: payload.currentProcess,
          teamSize: payload.teamSize,
          integrations: payload.integrations,
          dataComplexity: payload.dataComplexity,
          urgency: payload.urgency,
          budgetReadiness: payload.budgetReadiness,
          projectDescription: payload.projectDescription || "",
          website: ""
        }
      : collectEstimateData();

    setSummary("context", businessContextSummary(data));
    setSummary("bottlenecks", bottleneckSummary(data));
    setSummary("complexity", complexitySummary(data));
    setSummary("path", planningPathSummary(data, payload));
  }

  function setSummary(key, value) {
    const entry = summaryNodes[key];
    if (!entry?.node) return;
    entry.node.textContent = value || entry.placeholder;
  }

  function businessContextSummary(data) {
    const parts = [];
    if (data.location) {
      parts.push(`${labelFor("location", data.location)} (${data.location === "international" ? "USD" : "IDR"})`);
    }
    if (data.businessType) parts.push(labelFor("businessType", data.businessType));
    if (data.currentProcess) parts.push(labelFor("currentProcess", data.currentProcess));
    return parts.join(" | ");
  }

  function bottleneckSummary(data) {
    if (!data.automationNeeds.length) return "";
    const labels = data.automationNeeds.map((need) => labelFor("automationNeeds", need));
    const visible = labels.slice(0, 3).join(", ");
    const extra = labels.length > 3 ? ` +${labels.length - 3} more` : "";
    return `${labels.length} selected: ${visible}${extra}`;
  }

  function complexitySummary(data) {
    const parts = [];
    if (data.teamSize) parts.push(`${labelFor("teamSize", data.teamSize)} users`);
    if (data.integrations) parts.push(`${labelFor("integrations", data.integrations)} integrations`);
    if (data.dataComplexity) parts.push(labelFor("dataComplexity", data.dataComplexity));
    return parts.join(" | ");
  }

  function planningPathSummary(data, payload = null) {
    if (payload?.recommendedPackage) {
      return `Recommended path: ${payload.recommendedPackage}`;
    }
    if (validateEstimate(data).valid) {
      return `Potential path: ${calculateEstimate(data).package}`;
    }
    if (data.budgetReadiness) {
      return `Budget signal: ${selectedBudgetLabel(data)}`;
    }
    if (data.integrations || data.dataComplexity || data.automationNeeds.length) {
      return "Direction will firm up after bottleneck, data, and budget signals.";
    }
    return "";
  }

  function renderResult(payload) {
    setResultText("range", payload.estimatedRange);
    setResultText("timeline", payload.estimatedTimeline);
    setResultText("package", payload.recommendedPackage);
    setResultText("complexity", payload.complexityLabel);
    setResultText("explanation", payload.estimateExplanation);

    if (payloadPreview) {
      payloadPreview.innerHTML = `
        <dl>
          <div><dt>Business</dt><dd>${escapeHtml(payload.businessTypeLabel)}</dd></div>
          <div><dt>Needs</dt><dd>${escapeHtml(payload.automationNeedLabels)}</dd></div>
          <div><dt>Current process</dt><dd>${escapeHtml(payload.currentProcessLabel)}</dd></div>
          <div><dt>Budget readiness</dt><dd>${escapeHtml(payload.budgetReadinessLabel)}</dd></div>
        </dl>
      `;
    }
  }

  function setResultText(key, value) {
    const node = document.querySelector(`[data-result="${key}"]`);
    if (node) node.textContent = value;
  }

  function updateMailto(payload) {
    if (!mailtoLink || !config.contactEmail || !payload) return;

    const body = [
      "Hi Rifki,",
      "",
      "I completed the automation estimator.",
      "",
      `Recommended package: ${payload.recommendedPackage}`,
      `Estimated range: ${payload.estimatedRange}`,
      `Estimated timeline: ${payload.estimatedTimeline}`,
      `Complexity level: ${payload.complexityLabel}`,
      "",
      `Business location: ${payload.locationLabel}`,
      `Business type: ${payload.businessTypeLabel}`,
      `Company: ${payload.company || "-"}`,
      `Automation needs: ${payload.automationNeedLabels}`,
      `Current process: ${payload.currentProcessLabel}`,
      `Team size: ${payload.teamSizeLabel}`,
      `Integrations: ${payload.integrationsLabel}`,
      `Data complexity: ${payload.dataComplexityLabel}`,
      `Urgency: ${payload.urgencyLabel}`,
      `Budget readiness: ${payload.budgetReadinessLabel}`,
      "",
      `Name: ${payload.name || "-"}`,
      `Email: ${payload.email || "-"}`,
      `WhatsApp: ${payload.whatsapp || "-"}`,
      "",
      "Project description:",
      payload.projectDescription,
      "",
      `Disclaimer noted: ${estimateContent.disclaimer || ""}`
    ].join("\n");

    mailtoLink.href = `mailto:${config.contactEmail}?subject=${encodeURIComponent("Automation estimate request")}&body=${encodeURIComponent(body)}`;
  }

  async function postToWebhook(endpoint, payload) {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      body: JSON.stringify(payload)
    });
  }

  function getCooldownRemaining() {
    try {
      const lastSubmittedAt = Number(localStorage.getItem("estimateLastSubmittedAt") || "0");
      if (!Number.isFinite(lastSubmittedAt)) return 0;
      return Math.max(0, submitCooldownMs - (Date.now() - lastSubmittedAt));
    } catch {
      return 0;
    }
  }

  function setLastSubmittedAt() {
    try {
      localStorage.setItem("estimateLastSubmittedAt", String(Date.now()));
    } catch {
      // localStorage can be unavailable in private browsing contexts.
    }
  }

  function updateBudgetLabels() {
    const location = valueFor(form, "location");
    form.querySelectorAll("[data-budget-label]").forEach((node) => {
      const idr = node.getAttribute("data-idr") || "";
      const usd = node.getAttribute("data-usd") || "";
      if (location === "international") {
        node.textContent = usd;
      } else if (location === "indonesia") {
        node.textContent = idr;
      } else {
        const question = questionMap.budgetReadiness;
        const option = (question?.options || []).find((item) => item.idrLabel === idr && item.usdLabel === usd);
        node.textContent = option?.label || `${idr} / ${usd}`;
      }
    });
  }

  function trackEvent(name, payload = {}) {
    if (!name) return;
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", name, payload);
      }
      if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ event: name, ...payload });
      }
      if (typeof window.plausible === "function") {
        window.plausible(name, { props: payload });
      }
    } catch {
      // Analytics should never block the static estimator.
    }
  }

  function publicEventPayload(payload) {
    return {
      package: payload.recommendedPackageId || payload.recommendedPackage,
      complexity: payload.complexityLabel,
      market: payload.market,
      leadFit: payload.leadFitLabel
    };
  }

  function showMessage(node, message) {
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
  }

  function clearMessage(node) {
    if (!node) return;
    node.textContent = "";
    node.hidden = true;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
