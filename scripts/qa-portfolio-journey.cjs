const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { execFileSync } = require('node:child_process');
const base = 'http://localhost:3320';
const api = 'http://127.0.0.1:3321';
const dancer = '22222222-2222-4222-8222-222222222222';
const owner = '11111111-1111-4111-8111-111111111111';
const route = `/me/portfolio/${dancer}`;
const out = path.join(process.env.TEMP, 'deetz-portfolio-qa');
const state = async () => (await fetch(`${api}/qa/state`)).json();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { for(let i=0;i<60;i++){ if(await check())return; await sleep(500); } throw new Error('Condition did not settle'); }

(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const exp=Math.floor(Date.now()/1000)+3600;
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:owner,exp,aud:'authenticated',role:'authenticated'},'signature'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
  const session={access_token:jwt,refresh_token:'qa-refresh',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id:owner,email:'portfolio-qa@example.invalid',app_metadata:{},user_metadata:{}}};
  await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'localhost',path:'/'}]);
  await context.route('**/*',route=> /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(route.request().url()) ? route.continue() : route.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(base+route,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'내 포트폴리오 완성하기'}).waitFor();
    await page.screenshot({path:path.join(out,'journey-mobile.png'),fullPage:true});
    await page.getByRole('button',{name:/PDF|AI/}).first().click();
    await page.getByRole('button',{name:'텍스트',exact:true}).click();
    await page.getByPlaceholder(/포트폴리오 텍스트/).fill('활동명: QA Dancer\n2025년 3월 QA Festival 공연 댄서\nQA Battle 우승 (날짜 미상)');
    let lostResponse = false;
    await page.route(base+route, async intercepted => {
      if (!lostResponse && intercepted.request().method()==='POST' && intercepted.request().postData()?.includes('"kind":"text"')) {
        lostResponse = true;
        await intercepted.fetch(); // The server has accepted the job, but its response is lost.
        return intercepted.abort();
      }
      return intercepted.continue();
    });
    await page.getByRole('button',{name:'분석 시작'}).click();
    await page.getByRole('button',{name:'다시 시도',exact:true}).click();
    await until(async()=>(await state()).jobs.length===1);
    assert.equal(lostResponse,true);
    // A new browser visit can recover the DB draft even without session storage.
    await page.evaluate(()=>sessionStorage.clear());
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:/PDF|AI/}).first().click();
    await page.locator('input[value="QA Festival"]').waitFor({timeout:30000});
    await page.locator('input[type="date"]').nth(1).fill('2024-06-01');
    await page.locator('input[value="QA Festival"]').fill('QA Festival edited');
    await page.screenshot({path:path.join(out,'import-review-mobile.png'),fullPage:true});
    assert.equal(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,'import review must fit mobile');
    await page.getByRole('button',{name:'선택 항목 저장',exact:true}).click();
    await until(async()=> (await state()).careers.length===2);
    await page.getByRole('dialog').waitFor({state:'hidden'});
    let snapshot=await state();
    assert.equal(snapshot.careers[0].title,'QA Festival edited');
    assert.equal(snapshot.careers[1].date.slice(0,10),'2024-06-01');
    const job=snapshot.jobs[0].id;
    await page.evaluate(({owner,job})=>sessionStorage.setItem(`portfolio-import:${owner}`,job),{owner,job});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:/PDF|AI/}).first().click();
    await page.locator('input[value="QA Festival"]').waitFor();
    await page.locator('input[type="date"]').nth(1).fill('2024-06-01');
    await page.getByRole('button',{name:'선택 항목 저장',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert.equal((await state()).careers.length,2,'replayed review cannot duplicate careers');
    const png=await sharp({create:{width:400,height:500,channels:3,background:'#264E66'}}).png().toBuffer();
    await page.getByLabel('사진·영상 여러 개 추가',{exact:true}).setInputFiles([
      {name:'qa-one.png',mimeType:'image/png',buffer:png},
      {name:'long-name-'.repeat(15)+'.png',mimeType:'image/png',buffer:png},
    ]);
    await until(async()=>(await state()).dancer.portfolio.length===2);
    await page.getByLabel('YouTube·Vimeo 영상 주소',{exact:true}).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await page.getByRole('button',{name:'영상 추가',exact:true}).click();
    await until(async()=>(await state()).dancer.portfolio.length===3);
    const before=(await state()).dancer.portfolio;
    await page.getByRole('button',{name:'앞으로 이동',exact:true}).nth(1).click();
    await until(async()=>(await state()).dancer.portfolio[0].url===before[1].url);
    await page.getByRole('button',{name:'목록에서 빼기',exact:true}).first().click();
    await until(async()=>(await state()).dancer.portfolio.length===2);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#portfolio-media li').first().waitFor();
    assert.equal(await page.locator('#portfolio-media li').count(),2);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('#portfolio-media img')).every(img=>img.complete&&img.naturalWidth>0));
    const video=execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10','-t','0.5','-c:v','libx264','-pix_fmt','yuv420p','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'],{windowsHide:true,maxBuffer:2*1024*1024});
    await page.getByLabel('사진·영상 여러 개 추가',{exact:true}).setInputFiles({name:'qa-video.mp4',mimeType:'video/mp4',buffer:video});
    await until(async()=>(await state()).dancer.portfolio.length===3);
    await page.screenshot({path:path.join(out,'media-mobile.png'),fullPage:true});
    await page.getByRole('link',{name:'경력 직접 입력·수정 →'}).click();
    await page.getByRole('button',{name:/공연/}).first().click();
    await page.getByRole('button',{name:'수정',exact:true}).first().click();
    const title=page.locator('input[type="text"]').first();
    await title.fill('QA career updated again');
    await page.getByRole('button',{name:'수정 완료',exact:true}).click();
    await until(async()=>(await state()).careers.some(c=>c.title==='QA career updated again'));
    await page.goto(base+route,{waitUntil:'domcontentloaded'});
    assert.equal(await page.getByRole('link',{name:'내 dancers.bio 페이지 열기'}).getAttribute('href'),'https://dancers.bio/portfolio-qa');
    await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied');}},configurable:true}));
    await page.getByRole('button',{name:/복사/}).first().click();
    await page.getByText('자동 복사가 안 되면 위 주소를 길게 눌러 복사하세요.').waitFor();
    for(const width of [320,390,1280]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);
      await page.screenshot({path:path.join(out,`journey-${width}.png`),fullPage:true});
    }
    for(const lang of ['en','ja']){
      await page.goto(base+route+`?lang=${lang}`,{waitUntil:'domcontentloaded'});
      assert.equal(await page.locator('html').getAttribute('lang'),lang);
      await page.screenshot({path:path.join(out,`journey-${lang}.png`),fullPage:true});
    }
    await page.goto(base+'/d/portfolio-qa',{waitUntil:'domcontentloaded'});
    await page.getByText('QA career updated again',{exact:true}).waitFor();
    const nativeVideo=page.locator('video').first();
    await nativeVideo.waitFor();
    await nativeVideo.evaluate(video=>video.play());
    await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
    await page.screenshot({path:path.join(out,'public-profile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'result.json'),JSON.stringify({passed:true,careers:(await state()).careers.length,media:(await state()).dancer.portfolio.length,errors},null,2));
    console.log(`PASS: import/replay/edit/media/share/3 widths/3 languages. Evidence: ${out}`);
  }catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error((await page.locator('body').innerText()).slice(0,3000));throw error;}
  finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
