// Draws each <canvas data-line-chart> from the JSON <script> next to it.
// Colours come from CSS variables so light and dark mode both work.
(() => {
  const canvases = document.querySelectorAll("canvas[data-line-chart]");
  if (!canvases.length || !window.Chart) return;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  for (const canvas of canvases) {
    const { labels, values } = JSON.parse(canvas.nextElementSibling.textContent);
    const series = css("--viz-series-1");
    new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: series,
          backgroundColor: series,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBorderColor: css("--viz-surface"),
          pointBorderWidth: 2,
          tension: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: (ctx) => `Rating ${ctx.parsed.y.toFixed(1)}` },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: css("--viz-axis") },
            ticks: { color: css("--viz-muted"), maxRotation: 0, autoSkipPadding: 12 },
          },
          y: {
            grid: { color: css("--viz-grid") },
            border: { display: false },
            ticks: { color: css("--viz-muted"), maxTicksLimit: 5 },
          },
        },
      },
    });
  }
})();
