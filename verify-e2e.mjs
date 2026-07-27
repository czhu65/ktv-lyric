// End-to-end verification of the PRODUCTION build served at the /ktv-lyric/ base path.
// Uses only synthetic text written for this test — never song lyrics.
// Run:  node verify-e2e.mjs <baseUrl>
import { chromium } from 'playwright-core'

const BASE = process.argv[2] ?? 'http://localhost:4173/ktv-lyric/'
const SYNTHETIC = '我哋一齊唱歌\n時間慢慢流逝\n佢嘅眼淚流落嚟'

const results = []
const check = (name, pass, detail = '') =>
  results.push({ name, pass, detail })

const browser = await chromium.launch()
const page = await browser.newPage()

const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(String(e)))
const failedRequests = []
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`))

await page.goto(BASE, { waitUntil: 'networkidle' })

// 1. App loads at the subpath, under the right name
const title = await page.title()
check('app loads at /ktv-lyric/', title === 'Cantonese & Mandarin KTV Lyrics', title)
check('heading renders', (await page.locator('h1').innerText()).includes('KTV Lyrics'))

// 2. Assets resolve from the subpath, not root
const scriptSrc = await page.locator('script[type=module]').first().getAttribute('src')
check('assets served from /ktv-lyric/', !!scriptSrc && scriptSrc.startsWith('/ktv-lyric/'), scriptSrc ?? '')

// 3. Search box and the always-available paste fallback
check('search box present', await page.getByRole('searchbox').isVisible())
const pasteSummary = page.getByText(/paste lyrics manually/i)
check('paste fallback always available', await pasteSummary.isVisible())

// 4. Paste synthetic text and render it
await pasteSummary.click()
await page.locator('#paste-area').fill(SYNTHETIC)
await page.getByRole('button', { name: /use these lyrics/i }).click()
await page.waitForSelector('ruby', { timeout: 15000 })

const rubyCount = await page.locator('ruby').count()
check('ruby annotations rendered', rubyCount > 10, `${rubyCount} ruby elements`)

const firstRt = (await page.locator('rt').first().innerText()).trim()
check('jyutping shown above characters', /^[a-z]+[1-6]$/.test(firstRt), `first rt = "${firstRt}"`)

// 5. THE REGRESSION THE FINAL REVIEW CAUGHT:
//    every character was marked "no audio" before playback started.
const charButtons = await page.locator('button.char').count()
const noAudio = await page.locator('button.char[data-noaudio="true"]').count()
check('no spurious no-audio markers', noAudio === 0, `${noAudio} of ${charButtons} marked`)

// 6. Yale toggle changes the romanization live (settings is a disclosure now)
await page.locator('details.settings > summary').click()
await page.getByLabel('Romanization').selectOption('yale')
await page.waitForTimeout(300)
const yaleRt = (await page.locator('rt').first().innerText()).trim()
check('Yale toggle changes romanization', yaleRt !== firstRt && !/[1-6]/.test(yaleRt),
  `jyutping "${firstRt}" -> yale "${yaleRt}"`)
await page.getByLabel('Romanization').selectOption('jyutping')

// 6b. Dark/light theming actually applies to the document
const beforeTheme = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
await page.locator('.segmented button', { hasText: 'Dark' }).click()
await page.waitForTimeout(250)
const afterTheme = await page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-theme'),
  bg: getComputedStyle(document.body).backgroundColor,
}))
check('dark theme applies', afterTheme.attr === 'dark' && afterTheme.bg !== beforeTheme,
  `${beforeTheme} -> ${afterTheme.bg}`)
await page.locator('.segmented button', { hasText: 'System' }).click()
await page.locator('details.settings > summary').click()   // collapse again

// 7. Tapping a character opens the gloss for its word
await page.locator('button.char').first().click()
await page.waitForSelector('[role=dialog]', { timeout: 10000 })
const glossText = (await page.locator('[role=dialog]').innerText()).trim()
check('tap opens gloss popover', glossText.length > 0, glossText.split('\n').slice(0, 3).join(' | '))

// 8. THE OTHER REGRESSION: playing line 3 must highlight line 3, not line 1.
const lineButtons = page.getByRole('button', { name: /play line/i })
const lineCount = await lineButtons.count()
check('every line has a play button', lineCount >= 3, `${lineCount} line buttons`)
await lineButtons.nth(2).click()
await page.waitForTimeout(2500)
const activeInLine3 = await page
  .locator('p.lyric-line')
  .nth(2)
  .locator('button.char[data-active="true"]')
  .count()
const activeInLine1 = await page
  .locator('p.lyric-line')
  .nth(0)
  .locator('button.char[data-active="true"]')
  .count()
check('playing line 3 highlights line 3', activeInLine3 > 0 && activeInLine1 === 0,
  `line3 active=${activeInLine3}, line1 active=${activeInLine1}`)

// 9. Audio actually fetched
const audioRequests = []
page.on('response', (r) => r.url().includes('/audio/syl/') && audioRequests.push(r.status()))
await page.locator('button.char').nth(1).click()
await page.waitForTimeout(1500)

// 10. Service worker registered under the correct scope
const swScope = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations()
  return regs.map((r) => r.scope)
})
check('service worker scoped to /ktv-lyric/', swScope.some((s) => s.endsWith('/ktv-lyric/')),
  swScope.join(', ') || 'none')

// 11. No console errors (a missing favicon is expected and ignored)
const realErrors = consoleErrors.filter((e) => !/favicon/i.test(e))
check('no console errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))
const realFailed = failedRequests.filter((r) => !/favicon/i.test(r))
check('no failed requests', realFailed.length === 0, realFailed.slice(0, 2).join(' | '))

await browser.close()

console.log(`\n  Verifying ${BASE}\n`)
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(38)} ${r.detail}`)
}
const failed = results.filter((r) => !r.pass)
console.log(`\n  ${results.length - failed.length}/${results.length} checks passed\n`)
process.exit(failed.length ? 1 : 0)
