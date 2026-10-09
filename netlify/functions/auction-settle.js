const {rpc}=require('./lib/public-data');
// Netlify invokes scheduled functions internally, including when no buyer is online.
exports.handler=async()=>{
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Auction service is not configured');
 const count=await rpc('settle_due_auctions',{},process.env.SUPABASE_SERVICE_ROLE_KEY);
 return {statusCode:200,body:JSON.stringify({settled:count})};
};
