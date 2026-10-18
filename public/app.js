// Score entry: tap each team's games, then confirm. The Save button stays
// disabled until the score is a valid final score (N v 0..N-1, N = data-first-to)
// and then spells out the result, e.g. "Save: Josh & Shane win 5–3", so a
// mis-tap is caught before it's saved. Without this script the plain Save
// button still works and the server checks the score.
(() => {
  const update = (form) => {
    const save = form.querySelector("[data-save]");
    const hint = form.querySelector("[data-score-hint]");
    const a = form.querySelector('input[name="a"]:checked')?.value;
    const b = form.querySelector('input[name="b"]:checked')?.value;
    if (a === undefined || b === undefined) {
      save.disabled = true;
      save.textContent = "Pick both scores";
      hint.classList.remove("error");
      return;
    }
    const [ga, gb] = [Number(a), Number(b)];
    const firstTo = Number(form.dataset.firstTo);
    const valid = Math.max(ga, gb) === firstTo && Math.min(ga, gb) < firstTo;
    hint.classList.toggle("error", !valid);
    save.disabled = !valid;
    save.textContent = !valid
      ? "Not a valid score"
      : ga > gb
        ? `Save: ${form.dataset.teamA} win ${ga}–${gb}`
        : `Save: ${form.dataset.teamB} win ${gb}–${ga}`;
  };

  const init = (root) => root.querySelectorAll("form[data-score-form]").forEach(update);
  init(document);
  // The match screen is swapped in by HTMX every 15s; set up the new form too.
  document.addEventListener("htmx:load", (e) => init(e.detail.elt));
  document.addEventListener("change", (e) => {
    const form = e.target.closest && e.target.closest("form[data-score-form]");
    if (form) update(form);
  });
})();
