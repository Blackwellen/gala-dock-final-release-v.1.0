import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function fixture(calendar:string,ownStatus?:string,error=false){
 const calls:string[]=[];const ctx={supabase:{from:()=>({select:()=>({eq:()=>({in:async()=>({data:ownStatus?[{listing_id:'listing',status:ownStatus}]:[],error:null})})})}),rpc:async(name:string)=>{calls.push(name);return{data:calendar,error:error?{message:'unavailable'}:null};}}};
 const loaded={exports:{} as {availabilityFor:(ctx:unknown,ids:string[],event:unknown)=>Promise<Map<string,{state:string;label:string}>>}};
 const code=ts.transpileModule(readFileSync('src/lib/data/marketplace.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{module:loaded,exports:loaded.exports,require:(name:string)=>{if(name==='server-only')return{};throw new Error(name);},Date,Map,Promise});
 return{calls,run:()=>loaded.exports.availabilityFor(ctx,['listing'],{id:'event',starts_at:'2027-01-01T18:00:00Z',ends_at:'2027-01-01T22:00:00Z'})};
}
test('RLS-hidden bookings cannot produce a false likely-available result',async()=>{const f=fixture('unavailable');expect((await f.run()).get('listing')?.state).toBe('unavailable');expect(f.calls).toEqual(['listing_availability']);});
test('calendar open requires provider confirmation',async()=>{const f=fixture('available');expect((await f.run()).get('listing')?.label).toContain('confirmation required');});
test('failed availability lookup remains unknown',async()=>{const f=fixture('available',undefined,true);expect((await f.run()).get('listing')?.state).toBe('unknown');});
test('the event own confirmed booking is not classified as its own conflict',async()=>{const f=fixture('unavailable','confirmed');expect((await f.run()).get('listing')?.label).toBe('Booked for this event');expect(f.calls).toEqual([]);});
