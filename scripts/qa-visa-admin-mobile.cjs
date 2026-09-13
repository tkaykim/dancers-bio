const { chromium, webkit } = require(process.env.QA_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

// Read-only browser QA: never submits administrator edits or sends invitations.
const base = process.env.QA_BASE_URL || 'http://localhost:3127';
const out = process.env.QA_OUTPUT || path.join(os.tmpdir(), 'deetz-visa-admin-mobile');
const before = process.env.QA_BEFORE === '1';
const engine = process.env.QA_BROWSER || 'chromium';
fs.mkdirSync(out, { recursive: true });
const account = fs.readFileSync(path.join(process.env.USERPROFILE, '.claude/projects/C--Users-tkay-Desktop/memory/reference_deetz_e2e_admin.md'), 'utf8');
const email = account.match(/이메일: `([^`]+)`/)[1];
const password = account.match(/비밀번호: `([^`]+)`/)[1];

(async () => {
  const browser = await ({ chromium, webkit }[engine]).launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/login?next=/admin/visa`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('input[type=password]').evaluate(el => el.form.requestSubmit());
  await page.waitForURL('**/admin/visa', { timeout: 120000 });
  await page.locator('main ul > li > button').first().waitFor({ timeout: 120000 });
  const report = [];
  for (const width of [320, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(out, `${engine}-${width}-list.png`), fullPage: false });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    report.push({ width, view: 'list', overflow });
    if (!before) assert.ok(overflow <= 1, `List overflow at ${width}: ${overflow}`);
    if (!before) {
      const list = page.getByRole('list', { name: '비자 신청자 명단' });
      const count = await list.locator(':scope > li').count();
      const firstName = await list.locator(':scope > li').first().locator('button > div > div > span').first().innerText();
      const search = page.getByRole('searchbox');
      await search.fill(firstName);
      assert.ok(await list.locator(':scope > li').count() > 0, 'Search finds applicant');
      await search.fill('qa-no-match-594629294');
      await page.getByText('조건에 맞는 신청이 없습니다.').waitFor();
      await page.getByRole('button', { name: '필터 초기화' }).click();
      assert.equal(await list.locator(':scope > li').count(), count, 'Reset restores list');
      await page.getByRole('button', { name: /^필터$/ }).click();
      await page.getByLabel('신청 경로', { exact: true }).selectOption('program');
      await page.getByLabel('지원자 언어', { exact: true }).selectOption('en');
      await page.getByLabel('테스트·대상 아님 숨기기').check();
      assert.equal(await page.locator('#visa-list-filters').isVisible(), true);
      await page.screenshot({ path: path.join(out, `${engine}-${width}-filters.png`) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole('button', { name: '필터 3', exact: true }).click();
      assert.equal(await page.locator('#visa-list-filters').isVisible(), false);
      await page.getByRole('button', { name: '필터 초기화' }).click();
      await page.getByLabel('정렬 기준', { exact: true }).selectOption('name');
      const names = await list.locator(':scope > li > button > div > div:first-child > span:first-child').allTextContents();
      assert.deepEqual(names, [...names].sort((a, b) => b.localeCompare(a, 'ko')), 'Name descending order');
      await page.getByLabel('정렬 기준', { exact: true }).selectOption('default');
      assert.equal(await page.getByRole('button', { name: /오름차순/ }).isDisabled(), true);
      await page.getByLabel('정렬 기준', { exact: true }).selectOption('created');
      await page.getByRole('button', { name: /오름차순/ }).click();
      const bulk = page.locator('main details').first();
      await bulk.locator('summary').click();
      assert.equal(await bulk.getByRole('button', { name: '대상 불러오기' }).isVisible(), true);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await bulk.locator('summary').click();
      report.push({ width, checks: 'search, empty, reset, combined filters, collapse, sort, bulk toggle' });
    }
    await page.locator('main ul > li > button').first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))); });
    await page.screenshot({ path: path.join(out, `${engine}-${width}-detail.png`) });
    const detailOverflow = await dialog.evaluate(el => el.scrollWidth - el.clientWidth);
    const contentOverflow = await dialog.locator(':scope > div').last().evaluate(el => el.scrollWidth - el.clientWidth);
    report.push({ width, view: 'detail', overflow: detailOverflow, contentOverflow });
    if (!before) assert.ok(detailOverflow <= 1, `Detail overflow at ${width}: ${detailOverflow}`);
    if (!before) assert.ok(contentOverflow <= 1, `Detail content overflow at ${width}: ${contentOverflow}`);
    if (!before) {
      const metrics = await dialog.locator('input:not([type=checkbox]), select, textarea').evaluateAll(elements => elements.map(el => {
        const r = el.getBoundingClientRect();
        const parent = el.parentElement.getBoundingClientRect();
        return { tag: el.tagName, type: el.type, width: r.width, height: r.height, font: parseFloat(getComputedStyle(el).fontSize), outside: r.right > parent.right + 1 || r.left < parent.left - 1 };
      }));
      assert.ok(metrics.every(m => m.font >= 16 && m.height >= 44 && !m.outside), `Form controls at ${width}: ${JSON.stringify(metrics.filter(m => m.font < 16 || m.height < 44 || m.outside))}`);
      const memo = dialog.getByPlaceholder('메모 (담당자 메모, 진행 상황 등)');
      await memo.fill('QA unsaved draft');
      await page.screenshot({ path: path.join(out, `${engine}-${width}-detail-bottom.png`) });
      report.push({ width, formControlsChecked: metrics.length });
    }
    await dialog.getByRole('button', { name: /닫기|Close/ }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  if (!before) assert.deepEqual(errors, [], 'No browser page errors');
  fs.writeFileSync(path.join(out, `${engine}-report.json`), JSON.stringify({ report, errors }, null, 2));
  console.log(JSON.stringify({ report, errors }));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
