import assert from "node:assert/strict";

export async function inspectSearchLayout(page, withZoom = false) {
  const showcase = page.locator('.wordcell-showcase[data-hkm-fit="fill"]');
  await showcase.locator('.hkm-mode-stage[data-hkm-fitted]').waitFor();
  const samples = [];
  async function inspect(surface, mode, phase = 'selected') {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const sample = await showcase.evaluate(figure => {
      const stage = figure.querySelector('.hkm-mode-stage');
      const active = stage.querySelector('.hkm-mode-surface[aria-hidden="false"]');
      const terminal = active.querySelector('[data-hkm-density="presentation"]');
      const frame = active.querySelector('.hkm-window');
      const agent = active.querySelector('.hkm-agent-body');
      const lastTurn = agent?.querySelector('.hkm-agent-turn:last-child');
      const terminalBounds = terminal?.getBoundingClientRect();
      return {
        height: stage.getBoundingClientRect().height,
        width: stage.getBoundingClientRect().width,
        frameWidth: frame.getBoundingClientRect().width,
        frameHeight: frame.getBoundingClientRect().height,
        scaled: active.querySelector('[data-hkm-scaled]') !== null,
        terminal: terminal && { size: parseFloat(getComputedStyle(terminal).fontSize),
          minimum: parseFloat(getComputedStyle(document.documentElement).fontSize),
          linesVisible: [...terminal.querySelectorAll('.hkm-terminal-line')].every(line => {
            const bounds = line.getBoundingClientRect();
            return bounds.top >= terminalBounds.top - 1 && bounds.bottom <= terminalBounds.bottom + 1;
          }),
          overflow: terminal.scrollHeight > terminal.clientHeight + 1 || terminal.scrollWidth > terminal.clientWidth + 1 },
        agent: agent && { overflow: agent.scrollHeight > agent.clientHeight + 1 || agent.scrollWidth > agent.clientWidth + 1,
          lastTurnVisible: lastTurn && lastTurn.getBoundingClientRect().bottom <= Math.min(agent.getBoundingClientRect().bottom, frame.getBoundingClientRect().bottom) + 1 },
      };
    });
    assert.ok(!sample.scaled, 'Search: readable content is never scaled down');
    assert.ok(sample.frameWidth > 1 && sample.frameWidth <= sample.width + 1, 'Search: frame fits its column');
    assert.ok(Math.abs(sample.frameHeight - sample.height) <= 3, 'Search: each frame fills the stable stage');
    if (surface === 'Terminal') assert.ok(sample.terminal && sample.terminal.size >= sample.terminal.minimum - 0.1 && !sample.terminal.overflow && sample.terminal.linesVisible, `Search: complete terminal content fits at the reader’s text size (${phase})`);
    if (surface === 'Coding agent') assert.ok(sample.agent && !sample.agent.overflow && sample.agent.lastTurnVisible, 'Search: the complete coding-agent exchange fits inside its frame');
    samples.push({ surface, mode, phase, ...sample });
  }
  // Inspect the first terminal opening before changing any mode or viewport:
  // later interactions can trigger a refit that hides a first-render failure.
  await showcase.getByRole('tab', { name: 'Terminal', exact: true }).click();
  await inspect('Terminal', 'Exact words', 'first-open');
  for (const surface of ['Coding agent', 'Terminal']) {
    await showcase.getByRole('tab', { name: surface, exact: true }).click();
    for (const mode of ['Exact words', 'Meaning', 'File you’re changing']) {
      await showcase.getByRole('button', { name: mode, exact: true }).click();
      await inspect(surface, mode);
    }
  }
  assert.ok(Math.max(...samples.map(sample => sample.height)) - Math.min(...samples.map(sample => sample.height)) <= 1, 'Search: all modes and surfaces reserve one stable height');
  await showcase.getByRole('tab', { name: 'Coding agent', exact: true }).click();
  await showcase.getByRole('button', { name: 'Exact words', exact: true }).click();
  if (withZoom) {
    const viewport = page.viewportSize();
    const fontSize = await page.evaluate(() => document.documentElement.style.fontSize);
    try {
      await page.setViewportSize({ ...viewport, width: 390 });
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await inspectSearchLayout(page);
    } finally {
      await page.evaluate(value => { document.documentElement.style.fontSize = value; }, fontSize);
      await page.setViewportSize(viewport);
    }
  }
  return samples;
}
