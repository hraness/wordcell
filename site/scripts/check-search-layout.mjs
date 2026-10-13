import assert from "node:assert/strict";

/**
 * The home hero shows one coding-agent window below the copy. It must fit its
 * column at every width, keep the whole exchange readable without scaling or
 * clipping, and still fit on a phone when the reader doubles the text size.
 */
export async function inspectSearchLayout(page, withZoom = false) {
  const proof = page.locator('.wordcell-hero-proof');
  await proof.locator('.hkm-window').waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const sample = await proof.evaluate(figure => {
    const frame = figure.querySelector('.hkm-window');
    const agent = figure.querySelector('.hkm-agent-body');
    const turns = [...figure.querySelectorAll('.hkm-agent-turn')];
    const lastTurn = turns.at(-1);
    const box = element => element.getBoundingClientRect();
    return {
      width: box(figure).width,
      frameWidth: box(frame).width,
      frameHeight: box(frame).height,
      turns: turns.length,
      scaled: figure.querySelector('[data-hkm-scaled]') !== null,
      agentOverflow: agent !== null && (agent.scrollWidth > agent.clientWidth + 1),
      lastTurnVisible: lastTurn !== undefined && box(lastTurn).bottom <= box(frame).bottom + 1,
      size: agent === null ? 0 : parseFloat(getComputedStyle(agent).fontSize),
      minimum: parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.75,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
  assert.ok(sample.turns >= 2, 'Hero: the agent window shows the exchange');
  assert.ok(!sample.scaled, 'Hero: readable content is never scaled down');
  assert.ok(sample.frameWidth > 1 && sample.frameWidth <= sample.width + 1, 'Hero: the agent window fits its column');
  assert.ok(!sample.agentOverflow, 'Hero: the exchange never scrolls sideways');
  assert.ok(sample.lastTurnVisible, 'Hero: the complete exchange fits inside its frame');
  assert.ok(sample.size >= sample.minimum - 0.1, 'Hero: the exchange keeps a readable text size');
  assert.ok(!sample.pageOverflow, 'Hero: the agent window keeps the page within the viewport');
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
  return [sample];
}
