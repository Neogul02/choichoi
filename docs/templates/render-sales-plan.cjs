// docs/templates/sales-plan-calendar.html을 PNG로 찍는다 — node docs/templates/render-sales-plan.cjs [출력경로]
const path = require('node:path')
const { chromium } = require('playwright')

;(async () => {
  const html = path.join(__dirname, 'sales-plan-calendar.html')
  const out = process.argv[2] ?? path.join(__dirname, 'sales-plan.png')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 })
  // 웹폰트를 못 받아도(오프라인) 시스템 한글 폰트로 찍히도록 실패를 무시한다
  await page.goto('file://' + html, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.page').screenshot({ path: out })
  await browser.close()
  console.log(out)
})()
