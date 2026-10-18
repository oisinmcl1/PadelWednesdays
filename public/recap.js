// End-of-session recap card: drawn on a canvas, then shared as a PNG with the
// Web Share API (e.g. straight into the Snapchat group). Falls back to a download.
(() => {
  const button = document.querySelector("[data-recap]");
  if (!button) return;
  const data = JSON.parse(document.getElementById("recap-data").textContent);

  const W = 1080, H = 1350, PAD = 80;
  const C = { bg: "#0f3d2a", bg2: "#0a2b1d", text: "#ffffff", muted: "#a9c7b8", accent: "#d4f04c", row: "rgba(255,255,255,0.07)" };
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  function draw() {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const font = (weight, size) => (ctx.font = `${weight} ${size}px ${FONT}`);
    const text = (s, x, y, color = C.text, align = "left") => {
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(s, x, y);
    };

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, C.bg);
    g.addColorStop(1, C.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // A padel ball in the corner.
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(W - PAD - 40, PAD + 40, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(W - PAD - 40 - 52, PAD + 40, 42, -0.75, 0.75);
    ctx.stroke();

    let y = PAD + 30;
    font(700, 30);
    text("PADEL WEDNESDAYS", PAD, y, C.accent);
    y += 70;
    font(800, 64);
    text(data.date, PAD, y);
    y += 46;
    font(400, 30);
    text(`${data.results.length} matches${data.balls ? ` · Balls: ${data.balls}` : ""}`, PAD, y, C.muted);

    // Tonight's table.
    y += 80;
    font(700, 28);
    text("TONIGHT", PAD, y, C.muted);
    text("W", W - PAD - 260, y, C.muted, "right");
    text("L", W - PAD - 150, y, C.muted, "right");
    text("+/−", W - PAD, y, C.muted, "right");
    y += 20;
    const rowH = 64;
    data.standings.forEach((s, i) => {
      if (i === 0) {
        ctx.fillStyle = C.row;
        ctx.fillRect(PAD - 20, y, W - 2 * PAD + 40, rowH);
      }
      const base = y + 44;
      font(i === 0 ? 800 : 600, 36);
      text(`${i + 1}. ${s.name}${i === 0 ? "  🏆" : ""}`, PAD, base);
      font(600, 36);
      text(String(s.wins), W - PAD - 260, base, C.text, "right");
      text(String(s.losses), W - PAD - 150, base, C.text, "right");
      text(s.diff > 0 ? `+${s.diff}` : String(s.diff), W - PAD, base, C.text, "right");
      y += rowH;
    });

    // Results, as many as fit.
    y += 60;
    font(700, 28);
    text("RESULTS", PAD, y, C.muted);
    y += 16;
    const lineH = 50;
    const room = Math.floor((H - PAD - y) / lineH);
    const shown = data.results.length > room ? data.results.slice(0, room - 1) : data.results;
    for (const r of shown) {
      y += lineH;
      font(400, 30);
      text(r.a, W / 2 - 70, y, C.text, "right");
      font(800, 32);
      text(`${r.ga}–${r.gb}`, W / 2, y, C.accent, "center");
      font(400, 30);
      text(r.b, W / 2 + 70, y, C.text, "left");
    }
    if (shown.length < data.results.length) {
      y += lineH;
      font(400, 28);
      text(`+ ${data.results.length - shown.length} more`, W / 2, y, C.muted, "center");
    }
    return canvas;
  }

  button.addEventListener("click", async () => {
    const blob = await new Promise((resolve) => draw().toBlob(resolve, "image/png"));
    const file = new File([blob], `padel-${data.iso}.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Padel ${data.date}` });
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // they closed the share sheet
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  });
})();
