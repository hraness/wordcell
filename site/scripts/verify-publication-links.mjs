import assert from "node:assert/strict";

export const publicationLinkGroups = [
  { name: "article", selector: ".plain-publication__article-body a[href]:not([role='button'], [data-emphasis], [data-foil])" },
  { name: "sources", selector: ".plain-publication__sources a[href]" },
  { name: "footer", selector: ".plain-publication__article-footer a[href]:not(.plain-publication__sources a, .hraness-marketing-related__card)" },
];

// Runs inside an already-owned page. Missing optional slots are reported as
// missing, never counted as verified. Callers mark the slots their route owns.
export async function verifyPublicationLinks(page, groups = publicationLinkGroups) {
  const before = await page.evaluate(() => ({ x: scrollX, y: scrollY, forced: matchMedia("(forced-colors: active)").matches }));
  const priorFocus = await page.evaluateHandle(() => document.activeElement);
  const results = [];
  async function ink(link) {
    return link.evaluate(element => {
      const css = getComputedStyle(element);
      return { label: element.textContent.trim(), color: css.color, decoration: css.textDecorationLine,
        style: css.textDecorationStyle, ink: css.textDecorationColor, adjust: css.forcedColorAdjust,
        focused: element.matches(":focus-visible"), outline: css.outlineStyle, outlineWidth: css.outlineWidth };
    });
  }
  try {
    for (const forced of [false, true]) {
      await page.emulateMedia({ forcedColors: forced ? "active" : "none" });
      const systemInk = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "LinkText";
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      for (const group of groups) {
        const links = page.locator(group.selector).filter({ visible: true });
        const count = await links.count();
        assert.ok(count > 0 || group.required === false, `Missing ${group.name} links: ${group.selector}`);
        if (!count) { results.push({ group: group.name, forced, count, sampled: 0, verified: false }); continue; }
        const link = links.first();
        await link.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await link.evaluate(element => element.blur());
        const states = {};
        for (const state of ["rest", "hover", "focus"]) {
          if (state === "hover") await link.hover();
          if (state === "focus") {
            await page.mouse.move(0, 0);
            await page.keyboard.press("Tab");
            await link.focus();
          }
          await page.waitForFunction(({ selector, forced, state, systemInk, mutedRest }) => {
            const element = [...document.querySelectorAll(selector)].find(node => node.checkVisibility());
            if (!element) return false;
            const css = getComputedStyle(element);
            return forced ? css.textDecorationColor === systemInk
              : state === "rest" ? !mutedRest || css.textDecorationColor !== css.color
              : css.textDecorationColor === css.color;
          }, { selector: group.selector, forced, state, systemInk, mutedRest: group.mutedRest !== false }, { timeout: 5000 });
          const observed = await ink(link);
          const label = `${group.name}/${forced ? "forced" : "ordinary"}/${state}: ${JSON.stringify(observed)}`;
          assert.ok(observed.decoration.includes("underline"), label);
          assert.equal(observed.style, "dotted", label);
          if (forced) {
            assert.equal(observed.ink, systemInk, label);
            // In auto mode the UA may substitute ink at paint time. Authored
            // opt-outs must explicitly keep both text and underline legible.
            if (observed.adjust === "none") assert.equal(observed.color, systemInk, label);
          } else if (state !== "rest") assert.equal(observed.ink, observed.color, label);
          else if (group.mutedRest !== false) assert.notEqual(observed.ink, observed.color, label);
          if (state === "focus") {
            assert.equal(observed.focused, true, label);
            assert.ok(observed.outline !== "none" && parseFloat(observed.outlineWidth) > 0, label);
          }
          states[state] = observed;
        }
        results.push({ group: group.name, selector: group.selector, forced, count, sampled: 1, verified: true, states });
      }
    }
    return results;
  } finally {
    await page.emulateMedia({ forcedColors: before.forced ? "active" : "none" });
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.activeElement?.blur());
    await priorFocus.evaluate(element => { if (element?.isConnected && typeof element.focus === "function") element.focus({ preventScroll: true }); });
    await priorFocus.dispose();
    await page.evaluate(({ x, y }) => scrollTo(x, y), before);
  }
}
