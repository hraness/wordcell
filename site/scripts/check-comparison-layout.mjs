import assert from "node:assert/strict";

export async function inspectComparisonLayout(page) {
  const cards = await page.locator('[aria-label="Compare Wordcell with other tools"] .hraness-marketing-card').evaluateAll(elements => elements.map(card => {
    const box = element => {
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    };
    const icon = card.querySelector(':scope > .hraness-marketing-card__icon');
    const copy = card.querySelector(':scope > .hraness-marketing-card__copy');
    const title = card.querySelector('.hraness-marketing-card__title');
    const meta = card.querySelector('.hraness-marketing-card__meta');
    return {
      card: box(card), icon: icon && box(icon), copy: copy && box(copy),
      title: box(title), meta: box(meta), href: card.getAttribute('href'),
      artwork: card.querySelector('.hraness-marketing-card__art') !== null,
      clipped: [copy, title, meta].some(element => element && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)),
      decorative: icon?.getAttribute('aria-hidden'),
    };
  }));
  assert.equal(cards.length, 4, 'Home: four comparison destinations');
  for (const item of cards) {
    assert.ok(item.icon && item.copy, 'Comparison: explicit icon and copy slots');
    assert.equal(item.decorative, 'true', 'Comparison: adjacent title names the icon');
    assert.ok(item.href?.startsWith('/compare/'), 'Comparison: whole card links to its comparison');
    assert.ok(!item.artwork && !item.clipped, 'Comparison: complete text without an artwork well');
    assert.ok(Math.abs(item.icon.width - item.icon.height) <= 1 && item.icon.width >= 55, 'Comparison: square, readable mark');
    const beside = item.icon.right <= item.copy.x + 1;
    const stacked = item.icon.bottom <= item.copy.y + 1 && Math.abs(item.icon.x - item.copy.x) <= 1;
    assert.ok(beside || stacked, 'Comparison: icon and copy form distinct, aligned rows or columns');
    if (page.viewportSize().width >= 768) assert.ok(beside, 'Comparison: wide cards keep the icon beside the copy');
    assert.ok(item.copy.right <= item.card.right + 1 && item.meta.bottom <= item.card.bottom + 1, 'Comparison: content stays in its card');
  }
  const width = page.viewportSize().width;
  if (width <= 390) assert.equal(new Set(cards.map(item => Math.round(item.card.x))).size, 1, 'Comparison: one column on phones');
  if (width >= 1440) assert.equal(new Set(cards.map(item => Math.round(item.card.x))).size, 2, 'Comparison: two columns on wide screens');
  return cards;
}

export async function inspectComparisonReflow(page) {
  const viewport = page.viewportSize();
  const initialSize = await page.evaluate(() => document.documentElement.style.fontSize);
  try {
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ ...viewport, width });
      await inspectComparisonLayout(page);
    }
    await page.setViewportSize({ ...viewport, width: 390 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const cards = await inspectComparisonLayout(page);
    assert.ok(cards.every(item => item.icon.bottom <= item.copy.y + 1 && item.copy.width > item.icon.width), 'Comparison: enlarged text moves below the icon with room to read');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Comparison: enlarged text keeps page within viewport');
  } finally {
    await page.evaluate(value => { document.documentElement.style.fontSize = value; }, initialSize);
    await page.setViewportSize(viewport);
  }
}
