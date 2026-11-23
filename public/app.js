// Score entry: tap each team's games for the set, then confirm. The Save button
// stays disabled until the score is a valid set score (N v 0..N-1, N = data-first-to)
// and then spells out the result, e.g. "Save set 2: Josh & Shane win 5–3", adding
// "and the match 2–0" when that set decides it. Without this script the plain
// Save button still works and the server checks the score.
(() => {
  const update = (form) => {
    const save = form.querySelector("[data-save]");
    const a = form.querySelector('input[name="a"]:checked')?.value;
    const b = form.querySelector('input[name="b"]:checked')?.value;
    if (a === undefined || b === undefined) {
      save.disabled = true;
      save.textContent = "Pick both scores";
      return;
    }
    const [ga, gb] = [Number(a), Number(b)];
    const firstTo = Number(form.dataset.firstTo);
    const valid = Math.max(ga, gb) === firstTo && Math.min(ga, gb) < firstTo;
    save.disabled = !valid;
    if (!valid) {
      save.textContent = "Not a valid score";
      return;
    }
    // The winner's games and sets won including this one; say so if it wins the match.
    const d = form.dataset;
    const [team, won, lost, sets, otherSets] = ga > gb
      ? [d.teamA, ga, gb, Number(d.setsA) + 1, Number(d.setsB)]
      : [d.teamB, gb, ga, Number(d.setsB) + 1, Number(d.setsA)];
    save.textContent = `Save set ${d.set}: ${team} win ${won}–${lost}` +
      (sets >= Number(d.setsToWin) ? ` and the match ${sets}–${otherSets}` : "");
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

// Pay buttons: copy the payment reference as Revolut opens, ready to paste.
// The reference is shown under the button too, for when copying isn't allowed.
document.addEventListener("click", (e) => {
  const link = e.target.closest && e.target.closest("[data-copy]");
  if (link && navigator.clipboard) navigator.clipboard.writeText(link.dataset.copy).catch(() => {});
});
