const {processNotifications}=require('./lib/admin-email');
// Scheduled functions run only on the published production deploy.
exports.handler=async()=>({statusCode:200,body:JSON.stringify(await processNotifications())});
