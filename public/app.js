// Two-tap scoring: once every radio group in a [data-autosubmit] form has a
// choice, submit it. The visible Save button still works without this script.
document.addEventListener("change", (e) => {
  const form = e.target.closest && e.target.closest("form[data-autosubmit]");
  if (!form) return;
  const groups = new Set([...form.querySelectorAll("input[type=radio]")].map((i) => i.name));
  const chosen = [...groups].every((name) => form.querySelector(`input[name="${name}"]:checked`));
  if (chosen) form.requestSubmit();
});
