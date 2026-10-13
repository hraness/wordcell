import assert from "node:assert/strict";

/**
 * The home comparison is one table: four rows, each row's name links to its
 * comparison page beside a square mark, the table never widens the page, and
 * rows stack their cells on phones.
 */
export async function inspectComparisonLayout(page) {
  const table = page.locator('.wordcell-compare-table');
  await table.waitFor();
  const rows = await table.locator('tbody tr').evaluateAll(elements => elements.map(row => {
    const box = element => {
      const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
      return { x, y, width, height, right, bottom };
    };
    const link = row.querySelector('th a');
    const mark = link?.querySelector('svg, img, [data-provider-mark], span:first-child');
    const name = link?.querySelector(':scope > span:last-child');
    const detail = row.querySelector('td');
    return {
      row: box(row), link: link && box(link), mark: mark && box(mark), name: name && box(name), detail: detail && box(detail),
      href: link?.getAttribute('href'),
      text: detail?.textContent?.trim().length ?? 0,
      clipped: [name, detail].some(element => element && (element.scrollWidth > element.clientWidth + 1)),
    };
  }));
  const table_ = await table.evaluate(element => ({ right: element.getBoundingClientRect().right, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  assert.equal(rows.length, 4, 'Home: four comparison destinations');
  assert.ok(table_.right <= page.viewportSize().width + 1 && table_.scrollWidth <= table_.clientWidth + 1, 'Comparison: the table fits the viewport');
  for (const item of rows) {
    assert.ok(item.link && item.mark && item.name && item.detail, 'Comparison: mark, name, and detail cells');
    assert.ok(item.href?.startsWith('/compare/'), 'Comparison: the name links to its comparison');
    assert.ok(item.text > 0 && !item.clipped, 'Comparison: complete text in the row');
    assert.ok(Math.abs(item.mark.width - item.mark.height) <= 1 && item.mark.width >= 24, 'Comparison: square, readable mark');
    assert.ok(item.mark.right <= item.name.x + 1, 'Comparison: the mark sits beside the name');
    const beside = item.name.right <= item.detail.x + 1;
    const stacked = item.link.bottom <= item.detail.y + 1;
    assert.ok(beside || stacked, 'Comparison: name and detail form distinct columns or rows');
    if (page.viewportSize().width >= 768) assert.ok(beside, 'Comparison: wide rows keep the detail beside the name');
    if (page.viewportSize().width <= 390) assert.ok(stacked, 'Comparison: phone rows stack the detail under the name');
    assert.ok(item.detail.right <= item.row.right + 1 && item.detail.bottom <= item.row.bottom + 1, 'Comparison: content stays in its row');
  }
  return rows;
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
    await inspectComparisonLayout(page);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Comparison: enlarged text keeps page within viewport');
  } finally {
    await page.evaluate(value => { document.documentElement.style.fontSize = value; }, initialSize);
    await page.setViewportSize(viewport);
  }
}
