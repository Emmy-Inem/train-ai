import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

test('Video provider maintenance rejects public credentials and bounds privileged requests', async () => {
  let handler, providerCalls=0;
  const env={SUPABASE_SERVICE_ROLE_KEY:'legacy-service-fixture',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_fixture"}',YOUTUBE_API_KEY:'youtube-fixture'};
  const source=fs.readFileSync(new URL('../../supabase/functions/course-video-audit/index.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/m,'');
  vm.runInNewContext(stripTypeScriptTypes(source),{Deno:{env:{get:k=>env[k]},serve:fn=>{handler=fn;}},Response,Request,URLSearchParams,AbortSignal,verifiedVideos:()=>[],fetch:async()=>{providerCalls++;throw Error('Unexpected provider call');}});
  const request=(headers={},body={action:'verify',ids:[]})=>handler(new Request('https://fixture.test',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}));
  for(const headers of [{},{apikey:'sb_publishable_fixture'},{apikey:'sb_secret_wrong'},{authorization:'Bearer forged-token'}])assert.equal((await request(headers)).status,401);
  assert.equal(providerCalls,0);
  assert.equal((await request({apikey:'sb_secret_fixture'},{action:'verify',ids:['invalid']})).status,400);
  assert.equal((await request({authorization:'Bearer legacy-service-fixture'},{action:'search',queries:Array(41).fill('Valid topic')})).status,400);
  const result=await request({apikey:'sb_secret_fixture'});
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{verified:[],returned:[]});
  assert.equal(providerCalls,0);
});
