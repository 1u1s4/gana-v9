import assert from 'node:assert/strict';
import {test} from 'node:test';
import {boundedSourceFields} from './repositories/evidence.js';
import {isRealWebSourceRecord} from '../prediction/prompt-context.js';
test('oversized documentary locators remain exact in metadata without overflowing varchar or becoming truncated URLs',()=>{
 const url='https://example.org/'+ 'a'.repeat(1100),title='t'.repeat(600),externalId='e'.repeat(300);
 const result=boundedSourceFields({url,title,externalId});
 assert.equal(result.url,undefined);assert.equal(result.title?.length,500);assert.ok(result.externalId!.length<=240);
 assert.deepEqual(result.originals,{fullUrl:url,fullTitle:title,fullExternalId:externalId});
 assert.equal(isRealWebSourceRecord({sourceType:'web-search',metadata:result.originals} as any),true);
 assert.equal(isRealWebSourceRecord({sourceType:'web-search',metadata:{...result.originals,synthesized:true}} as any),false);
 assert.notEqual(result.externalId,boundedSourceFields({externalId:externalId+'different'}).externalId);
});
