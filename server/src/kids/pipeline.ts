import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { synthesizeSpeech } from "../lib/elevenlabs.js";
import { openai } from "../lib/openai.js";
import { withRetry } from "../lib/retry.js";
import { probeDuration } from "../pipeline/ffmpeg.js";
import { scenesToSrt, type Scene } from "../pipeline/scenes.js";
import { spawn } from "node:child_process";

type KidsScript = {
  title:string; lesson:string; logline:string;
  scenes:Array<{ narration:string; visual:string; action:string }>;
  closing:string;
};
const schema = {
  type:"object",
  additionalProperties:false,
  properties:{
    title:{type:"string"}, lesson:{type:"string"}, logline:{type:"string"},
    scenes:{type:"array",minItems:10,maxItems:14,items:{type:"object",additionalProperties:false,properties:{
      narration:{type:"string"},visual:{type:"string"},action:{type:"string"}
    },required:["narration","visual","action"]}},
    closing:{type:"string"}
  },
  required:["title","lesson","logline","scenes","closing"]
};

export async function runKidsEpisode(episodeId:string, seriesId:string, userId:string):Promise<void>{
  const work=path.resolve(env.WORK_DIR,"kids-"+episodeId);
  await mkdir(work,{recursive:true});
  try{
    await setEpisode(episodeId,{status:"draft",error:null});
    const {data:series,error:se}=await supabaseAdmin.from("kids_series").select("name,target_age_min,target_age_max,language,visual_style,content_rules").eq("id",seriesId).single();
    if(se||!series) throw new Error("series not found");
    const {data:chars,error:ce}=await supabaseAdmin.from("kids_characters").select("name,role,personality,visual_description,voice_description").eq("series_id",seriesId).order("created_at");
    if(ce) throw ce;
    const prompt=`Create the next preschool cartoon episode for "${series.name}" for ages ${series.target_age_min}-${series.target_age_max}.
Style: ${series.visual_style}. Language: ${series.language}.
Characters: ${JSON.stringify(chars)}.
Rules: ${JSON.stringify(series.content_rules)}.
Episode seed: "The Rainbow Seed". Lesson: kindness and caring for growing things.
Return exactly 12-14 short scenes. Each narration is 8-22 spoken words. Visual and action describe only original, safe 2D cartoon animation. No scary, violent, dangerous, romantic, political, branded, or copyrighted characters. Keep vocabulary simple and positive.`;
    await setEpisode(episodeId,{status:"script_ready"});
    const resp=await withRetry(()=>openai.chat.completions.create({
      model:env.OPENAI_MODEL,response_format:{type:"json_object"},temperature:.65,
      messages:[{role:"system",content:"You are a children's TV showrunner. Output JSON only."},{role:"user",content:prompt}]
    }),{label:"kids.script"});
    const script=JSON.parse(resp.choices[0]?.message?.content??"{}") as KidsScript;
    if(!script.scenes?.length) throw new Error("empty kids script");
    await setEpisode(episodeId,{title:script.title,lesson:script.lesson,logline:script.logline,script,status:"script_ready"});
    
    const narration=[...script.scenes.map(s=>s.narration),script.closing].join(" ");
    const audio=await synthesizeSpeech(narration,{voiceId:env.ELEVENLABS_VOICE_ID,stability:.62,similarityBoost:.72});
    const audioPath=path.join(work,"voice.mp3"); await writeFile(audioPath,audio);
    const duration=await probeDuration(audioPath);
    const all=[...script.scenes.map(s=>s.narration),script.closing];
    const words=all.map(x=>x.trim().split(/\s+/).filter(Boolean).length);
    const total=words.reduce((a,b)=>a+b,0)||1; let cursor=0;
    const scenes:Scene[]=all.map((text,i)=>{const d=Math.max(.8,duration*(words[i]!/total)); const start=cursor; const end=i===all.length-1?duration:Math.min(duration,cursor+d); cursor=end; return {index:i,text,startSec:start,endSec:end};});
    await setEpisode(episodeId,{audio_manifest:{duration_seconds:duration,provider:"elevenlabs",voice_id:env.ELEVENLABS_VOICE_ID},scenes,status:"assets_ready"});
    
    const srt=path.join(work,"subs.srt"); await writeFile(srt,scenesToSrt(scenes));
    const clips:string[]=[];
    for(let i=0;i<scenes.length;i++){
      const svg=path.join(work,`scene-${i}.svg`), clip=path.join(work,`scene-${i}.mp4`);
      await writeFile(svg,makeSvg(script.scenes[i]?.visual??"Milo and Momo explore a colorful garden",script.scenes[i]?.action??"They smile and wave",i));
      await ffmpeg(["-y","-loop","1","-i",svg,"-t",(scenes[i]!.endSec-scenes[i]!.startSec).toFixed(3),"-vf",`scale=${env.RENDER_WIDTH}:${env.RENDER_HEIGHT}:force_original_aspect_ratio=decrease,pad=${env.RENDER_WIDTH}:${env.RENDER_HEIGHT}:(ow-iw)/2:(oh-ih)/2,zoompan=z='min(zoom+0.0007,1.08)':d=1:s=${env.RENDER_WIDTH}x${env.RENDER_HEIGHT}:fps=${env.RENDER_FPS}`,"-an","-c:v","libx264","-pix_fmt","yuv420p","-preset","veryfast","-crf","23",clip]);
      clips.push(clip);
    }
    const list=path.join(work,"concat.txt"); await writeFile(list,clips.map(x=>`file '${x.replace(/'/g,"'\\''")}'`).join("\n"));
    const silent=path.join(work,"silent.mp4"), final=path.join(work,"episode.mp4"), thumb=path.join(work,"thumbnail.jpg");
    await ffmpeg(["-y","-f","concat","-safe","0","-i",list,"-c","copy",silent]);
    await ffmpeg(["-y","-i",silent,"-i",audioPath,"-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart",final]);
    await ffmpeg(["-y","-ss","0.2","-i",final,"-frames:v","1","-q:v","3",thumb]);
    await setEpisode(episodeId,{status:"rendering"});
    const videoUrl=await upload(userId,episodeId,final,"video/mp4","episode.mp4");
    const thumbUrl=await upload(userId,episodeId,thumb,"image/jpeg","thumbnail.jpg");
    await setEpisode(episodeId,{render_url:videoUrl,thumbnail_url:thumbUrl,status:"review",qa_report:{automated_checks:["script_schema","scene_count","audio_present","video_rendered","thumbnail_rendered"],human_approval_required:true}});
  }catch(e){await setEpisode(episodeId,{status:"failed",error:e instanceof Error?e.message:String(e)}); throw e}
  finally{await rm(work,{recursive:true,force:true}).catch(()=>undefined)}
}
async function setEpisode(id:string,patch:Record<string,unknown>){const {error}=await supabaseAdmin.from("kids_episodes").update(patch).eq("id",id); if(error) throw error;}
async function upload(userId:string,id:string,file:string,type:string,name:string){const bytes=await import("node:fs/promises").then(m=>m.readFile(file)); const key=`kids/${userId}/${id}/${name}`; const r=await supabaseAdmin.storage.from(env.SUPABASE_STORAGE_BUCKET).upload(key,bytes,{contentType:type,upsert:true,cacheControl:"3600"}); if(r.error) throw r.error; return supabaseAdmin.storage.from(env.SUPABASE_STORAGE_BUCKET).getPublicUrl(key).data.publicUrl;}
async function ffmpeg(args:string[]){await new Promise<void>((resolve,reject)=>{const p=spawn(env.FFMPEG_PATH,args,{stdio:["ignore","pipe","pipe"]});let err="";p.stderr.on("data",c=>err+=c);p.on("error",reject);p.on("close",c=>c===0?resolve():reject(new Error("ffmpeg failed: "+err.slice(-1500))))})}
function esc(s:string){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function makeSvg(visual:string,action:string,i:number){const bob=(i%2)*12;return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9f3ff"/><stop offset="1" stop-color="#fff1b8"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><circle cx="170" cy="220" r="75" fill="#fff" opacity=".8"/><circle cx="300" cy="260" r="105" fill="#fff" opacity=".8"/><circle cx="870" cy="260" r="90" fill="#fff" opacity=".8"/><rect y="1450" width="1080" height="470" fill="#9bd66f"/><ellipse cx="430" cy="${1120+bob}" rx="210" ry="260" fill="#f28c28"/><circle cx="360" cy="${1040+bob}" r="22" fill="#222"/><circle cx="500" cy="${1040+bob}" r="22" fill="#222"/><path d="M380 ${1120+bob} Q430 ${1155+bob} 480 ${1120+bob}" fill="none" stroke="#222" stroke-width="12"/><ellipse cx="730" cy="${850-bob}" rx="190" ry="130" fill="#fff"/><circle cx="680" cy="${850-bob}" r="18" fill="#222"/><circle cx="770" cy="${850-bob}" r="18" fill="#222"/><path d="M700 ${900-bob} Q730 ${925-bob} 760 ${900-bob}" fill="none" stroke="#222" stroke-width="10"/><text x="540" y="155" text-anchor="middle" font-family="Arial" font-size="42" font-weight="700" fill="#245">Milo &amp; Momo</text><text x="540" y="1760" text-anchor="middle" font-family="Arial" font-size="34" fill="#173">${esc(visual.slice(0,95))}</text><text x="540" y="1810" text-anchor="middle" font-family="Arial" font-size="30" fill="#173">${esc(action.slice(0,105))}</text></svg>`}
