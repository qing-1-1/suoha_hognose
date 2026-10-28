'use strict';
const {rpc,json}=require('./lib/public-data');

// The schedule in netlify.toml makes this an internal scheduled function: Netlify
// does not expose its production URL. next_run validates the payload, NOT identity.
// Reject routed HTTP events as defense against accidental local/public exposure;
// never authorize using user-controlled headers or a body-supplied date range.
// https://docs.netlify.com/build/functions/scheduled-functions/
exports.handler=async(event={})=>{
  if(event.rawUrl||event.path||event.requestContext?.http||event.requestContext?.httpMethod){
    return json(403,{error:'Scheduled invocation only'});
  }
  let payload;
  try{payload=JSON.parse(event.body||'null');}catch{return json(403,{error:'Scheduled invocation only'});}
  if(typeof payload?.next_run!=='string'||!Number.isFinite(Date.parse(payload.next_run))){
    return json(403,{error:'Scheduled invocation only'});
  }
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.SUPABASE_URL||!process.env.SUPABASE_PUBLISHABLE_KEY){
    throw new Error('Room plan generation service is not configured');
  }
  try{
    // The database owns the timezone, lookahead and idempotent recurrence rules.
    const generated=await rpc('room_generate_plans',{p_from:null,p_to:null},process.env.SUPABASE_SERVICE_ROLE_KEY);
    return json(200,{generated});
  }catch{
    // Fail the invocation so monitoring sees the outage, without logging secrets,
    // transport details or private snake records from the database error payload.
    throw new Error('Room plan generation failed');
  }
};
