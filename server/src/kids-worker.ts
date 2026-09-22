import { supabaseAdmin } from "./lib/supabase.js";
import { runKidsEpisode } from "./kids/pipeline.js";
import { logger } from "./lib/logger.js";
const POLL_MS=10000;
let stopping=false;
async function loop(){
 while(!stopping){
  const {data:jobs,error}=await supabaseAdmin.from("kids_jobs").select("id,episode_id,series_id,payload,attempts,max_attempts").eq("status","queued").eq("job_type","showrunner_script").order("created_at").limit(1);
  if(error){logger.error({error},"kids queue read failed"); await new Promise(r=>setTimeout(r,POLL_MS)); continue;}
  const job=jobs?.[0];
  if(!job){await new Promise(r=>setTimeout(r,POLL_MS)); continue;}
  await supabaseAdmin.from("kids_jobs").update({status:"running",started_at:new Date().toISOString(),attempts:(job.attempts??0)+1}).eq("id",job.id);
  try{
   const {data:series}=await supabaseAdmin.from("kids_series").select("user_id").eq("id",job.series_id).single();
   if(!series?.user_id) throw new Error("series owner missing");
   await runKidsEpisode(job.episode_id,job.series_id,series.user_id);
   await supabaseAdmin.from("kids_jobs").update({status:"completed",finished_at:new Date().toISOString(),error:null}).eq("id",job.id);
  }catch(e){
   const message=e instanceof Error?e.message:String(e);
   await supabaseAdmin.from("kids_jobs").update({status:"failed",finished_at:new Date().toISOString(),error:message}).eq("id",job.id);
   logger.error({jobId:job.id,error:message},"kids episode failed");
  }
 }
}
loop().catch(e=>{logger.error({e},"kids worker stopped");process.exit(1)});
for(const sig of ["SIGINT","SIGTERM"] as const){process.on(sig,()=>{stopping=true;logger.info({sig},"kids worker stopping")})}
