/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3107'
const artifactDir = process.env.E2E_ARTIFACT_DIR || path.join(process.cwd(), '.gstack', 'qa-reports', 'visa-documents')

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))

  await page.goto(`${base}/e2e/visa-documents-preview`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: path.join(artifactDir, 'desktop-language-en.png'), fullPage: true })
  await page.getByRole('button', { name: '한국어' }).click()
  await page.getByRole('heading', { name: '비자 서류 정보' }).waitFor()
  await page.getByText('기본 인적사항', { exact: true }).first().waitFor()
  await page.getByRole('button', { name: '日本語' }).click()
  await page.getByRole('heading', { name: 'ビザ書類情報' }).waitFor()
  await page.getByText('日本のマイナンバーはこのページでは収集しません。').waitFor()
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByRole('heading', { name: 'Visa document information' }).waitFor()
  await page.getByLabel('Full name in English').fill('E2E AUTOSAVE APPLICANT')
  await page.waitForTimeout(1600)
  await page.getByText(/^Saved/).waitFor()
  const nationalId = page.getByLabel('National identification number')
  if (!(await nationalId.isDisabled())) throw new Error('Japanese national ID field must be disabled')
  await page.getByRole('button', { name: /Save & continue/ }).click()
  await page.getByText('Nationality & passport', { exact: true }).waitFor()

  for (let step = 1; step < 6; step += 1) {
    await page.getByRole('button', { name: /Save & continue/ }).click()
  }
  await page.getByText('Other travel & submit', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Add trip' }).click()
  await page.getByLabel('Travel country').fill('France')
  await page.getByLabel('Travel purpose').fill('Tourism')
  const dates = page.locator('input[type="date"]')
  await dates.nth(0).fill('2025-05-03')
  await dates.nth(1).fill('2025-05-09')
  await page.waitForTimeout(1600)
  await page.getByText(/^Saved/).waitFor()
  await page.getByRole('button', { name: /Submit information/ }).click()
  await page.getByText(/Your information has been submitted/).waitFor()
  await page.screenshot({ path: path.join(artifactDir, 'desktop-submitted.png'), fullPage: true })

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true })
  mobile.on('console', (message) => {
    if (message.type() === 'error') errors.push(`mobile console: ${message.text()}`)
  })
  await mobile.goto(`${base}/e2e/visa-documents-preview`, { waitUntil: 'networkidle' })
  await mobile.getByRole('button', { name: '한국어' }).click()
  await mobile.getByRole('heading', { name: '비자 서류 정보' }).waitFor()
  await mobile.waitForTimeout(250)
  await mobile.screenshot({ path: path.join(artifactDir, 'mobile-ko-step-1.png'), fullPage: true })
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  if (overflow) throw new Error('Mobile page has horizontal overflow')

  await browser.close()
  if (errors.length) throw new Error(errors.join('\n'))
  process.stdout.write('E2E passed: ko/en/ja switching, autosave, navigation, JP-sensitive-data guard, repeatable travel, submit, mobile overflow.\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exit(1)
})
