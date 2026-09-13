const { chromium, webkit } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.QA_BASE_URL || 'http://localhost:3128';
const output = process.env.QA_OUTPUT || path.join(require('node:os').tmpdir(), 'deetz-homepage-redesign');
const before = process.env.QA_BEFORE === '1';
const engine = process.env.QA_BROWSER || 'chromium';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await ({ chromium, webkit }[engine]).launch();
  const context = await browser.newContext({ locale: 'ko-KR', ignoreHTTPSErrors: process.env.QA_SELF_SIGNED_HTTPS === '1' });
  const errors = [];
  const newPage = async () => {
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    return page;
  };
  const report = [];
  for (const lang of before ? ['ko'] : ['ko', 'en', 'ja']) {
    for (const width of before ? [1440, 390] : [320, 390, 768, 1440]) {
      const page = await newPage();
      await page.setViewportSize({ width, height: 1000 });
      const start = Date.now();
      const response = await page.goto(`${base}/?lang=${lang}`, { waitUntil: 'networkidle', timeout: 120000 });
      assert.equal(response.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      await page.screenshot({ path: path.join(output, `${engine}-${lang}-${width}.png`), fullPage: true });
      await page.screenshot({ path: path.join(output, `${engine}-${lang}-${width}-top.png`) });
      if (!before) {
        assert.ok(overflow <= 1, `Overflow ${lang}/${width}: ${overflow}`);
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.locator('h1').innerText(), { ko: '댄서 섭외부터\n안무 제작까지.', en: 'Dancer casting\nand choreography.', ja: 'ダンサーの手配から\n振付制作まで。' }[lang]);
        assert.equal(await page.locator('html').getAttribute('lang'), lang);
        const languageTops = await page.locator('header button[lang]').evaluateAll(els => els.map(el => el.getBoundingClientRect().top));
        assert.ok(Math.max(...languageTops) - Math.min(...languageTops) < 2, `Language switcher stays on one row: ${lang}/${width}`);
        const image = page.locator('[data-home-hero] img');
        assert.ok(await image.evaluate(el => el.complete && el.naturalWidth > 400), 'Hero image loaded');
        const summary = page.locator('main details summary').first();
        await summary.click();
        assert.equal(await summary.evaluate(el => el.parentElement.open), true);
        await summary.click();
        const links = await page.locator('main a[href]').evaluateAll(els => els.map(el => el.getAttribute('href')));
        for (const href of ['/feed', '/dancers', '/projects/new', '/signup', '/guide', '/program?lang=en']) assert.ok(links.includes(href), `Missing ${href}`);
        const program = page.locator('main a[href="/program?lang=en"]');
        assert.equal(await program.getAttribute('lang'), 'en');
        assert.ok((await program.innerText()).includes('For international dancers planning to work in Korea'));
        assert.equal(await page.locator('[data-home-hero] dt').last().innerText(), {ko:'누적 공고',en:'Total casting calls',ja:'累計募集件数'}[lang]);
        const jsonld = await page.locator('script[type="application/ld+json"]').allTextContents();
        assert.ok(jsonld.some(text => JSON.parse(text)['@graph']?.some(item => item['@type'] === 'FAQPage')), 'FAQ structured data preserved');
        // FAQ interaction scrolls new links into view and starts Next.js prefetches.
        await page.waitForLoadState('networkidle');
      }
      report.push({ lang, width, overflow, loadMs: Date.now() - start });
      await page.close();
    }
  }
  if (!before) {
    const page = await newPage();
    await page.goto(`${base}/?lang=ko`, { waitUntil: 'networkidle' });
    await page.locator('header button[lang="en"]').click();
    await page.waitForURL(url => !url.searchParams.has('lang'));
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'Language preference persists');
    await page.locator('[data-home-hero] a[href="/dancers"]').click();
    await page.waitForURL('**/dancers');
    await page.waitForLoadState('networkidle');
    await page.goto(`${base}/?lang=ko`, { waitUntil: 'networkidle' });
    await page.locator('main a[href="/projects/new"]').click();
    await page.waitForURL(url => url.pathname === '/login' && url.searchParams.get('next') === '/projects/new');
    await page.waitForLoadState('networkidle');
    report.push({ checks: 'Language switch and persistence; dancer CTA; authenticated project creation entry' });
  }
  fs.writeFileSync(path.join(output, `${engine}-report.json`), JSON.stringify({ report, errors }, null, 2));
  console.log(JSON.stringify({ report, errors }));
  await browser.close();
  assert.deepEqual(errors, []);
})().catch(error => { console.error(error); process.exit(1); });
