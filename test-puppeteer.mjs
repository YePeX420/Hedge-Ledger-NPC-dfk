import puppeteer from 'puppeteer';

async function test() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
  });
  
  const page = await browser.newPage();
  await page.goto('https://docs.defikingdoms.com/gameplay/combat/archer', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  
  // Find the parent of table_rowGroup and examine siblings
  const structureInfo = await page.evaluate(() => {
    const rowGroupDiv = document.querySelector('div[class*="table_rowGroup__"]');
    if (!rowGroupDiv) return { error: "No rowGroup found" };
    
    const parent = rowGroupDiv.parentElement;
    const siblings = Array.from(parent.children);
    
    return siblings.map((sib, i) => {
      const className = sib.className.substring(0, 80);
      const directChildDivs = Array.from(sib.querySelectorAll(':scope > div'));
      const sample = directChildDivs.map(d => d.textContent.trim().substring(0, 60));
      return { 
        index: i, 
        tag: sib.tagName,
        classSnippet: className,
        childCount: directChildDivs.length,
        sampleText: sample.slice(0, 3)
      };
    });
  });
  
  console.log("Parent siblings:", JSON.stringify(structureInfo, null, 2));
  
  await browser.close();
}

test().catch(e => console.error(e));
