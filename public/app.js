// Two-tap scoring: once every radio group in a [data-autosubmit] form has a
// choice, submit it. The visible Save button still works without this script.
// With data-first-to="N", only a valid final score (N v 0..N-1) auto-submits;
// anything else highlights the rule instead.
document.addEventListener("change", (e) => {
  const form = e.target.closest && e.target.closest("form[data-autosubmit]");
  if (!form) return;
  const groups = [...new Set([...form.querySelectorAll("input[type=radio]")].map((i) => i.name))];
  const values = groups.map((name) => form.querySelector(`input[name="${name}"]:checked`)?.value);
  if (values.some((v) => v === undefined)) return;

  const firstTo = Number(form.dataset.firstTo);
  if (firstTo) {
    const [a, b] = values.map(Number);
    const valid = Math.max(a, b) === firstTo && Math.min(a, b) < firstTo;
    const hint = form.querySelector("[data-score-hint]");
    if (hint) hint.classList.toggle("error", !valid);
    if (!valid) return;
  }
  form.requestSubmit();
});
