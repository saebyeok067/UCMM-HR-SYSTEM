import { NextRequest,NextResponse } from "next/server";
import { createClient as serviceClient } from "@supabase/supabase-js";
import { createClient as cookieClient } from "@/lib/supabase/server";

const CONFIG:Record<string,{table:string,roles:string[],fields:string[]}>={
 hiring:{table:"hr_applicants",roles:["hr_admin","hr_staff"],fields:["name","email","phone","position","branch","stage","interview_date","notes","rating"]},
 compliance:{table:"hr_compliance",roles:["hr_admin","hr_staff"],fields:["employee_id","agency","reference_no","period","employee_amount","employer_amount","due_date","remitted_at","status","notes"]},
 files201:{table:"hr_employee_files",roles:["hr_admin","hr_staff"],fields:["employee_id","folder","title","kind","notes","status","storage_path"]},
 incidents:{table:"hr_incidents",roles:["hr_admin","hr_staff","manager"],fields:["employee_id","title","occurred_on","category","severity","status","description","action_taken","case_number","branch"]}
};
const response=(error:string,status:number)=>NextResponse.json({error},{status});
async function context(module:string){
 const conf=CONFIG[module];if(!conf)return {error:response("Unknown module",404)};
 const userDb=await cookieClient();const {data:{user}}=await userDb.auth.getUser();if(!user)return {error:response("Sign in required",401)};
 const db=serviceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error}=await db.from("profiles").select("role,branch,status").eq("id",user.id).single();
 if(error||!profile||profile.status!=="Active"||!conf.roles.includes(profile.role))return {error:response("Access denied",403)};
 return {conf,db,user,profile};
}
async function handler(req:NextRequest,params:Promise<{module:string}>,method:"GET"|"POST"|"PATCH"){
 try{
 const {module}=await params;const ctx=await context(module);if(ctx.error)return ctx.error;
 const {conf,db,user,profile}=ctx;if(!conf||!db||!user||!profile)return response("Context error",500);
 if(method==="GET"){
 let q=db.from(conf.table).select("*").order("created_at",{ascending:false}).limit(500);
 if(profile.role==="manager")q=q.eq("branch",profile.branch||"__none__");
 const {data,error}=await q;return error?response(error.message,500):NextResponse.json({items:data||[]});
 }
 const body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))return response("Invalid body",400);
 const id=String(body.id||"");if(method==="PATCH"&&!/^[0-9a-f-]{36}$/i.test(id))return response("Valid record ID required",400);
 const payload:Record<string,unknown>={};for(const f of conf.fields)if(Object.prototype.hasOwnProperty.call(body,f))payload[f]=body[f];
 if(!Object.keys(payload).length)return response("No fields supplied",400);
 if(module==="hiring"&&payload.stage&&!['Applied','Screening','Shortlisted','Interview','Offered','Hired','Rejected'].includes(String(payload.stage)))return response("Invalid hiring stage",400);
 if(module==="files201"&&payload.folder&&!['Onboarding Files','Compliance & Other Forms','NOV / NTE','Payslips','Other'].includes(String(payload.folder)))return response("Invalid folder",400);
 if(module==="incidents"&&profile.role==="manager"){
 if(method==="PATCH")return response("Manager may only submit incident reports",403);
 payload.branch=profile.branch;
 }
 if(method==="POST"&&module==="hiring"&&!payload.name)return response("Applicant name required",400);
 if(method==="POST"&&module==="incidents"&&(!payload.title||!payload.employee_id))return response("Title and employee required",400);
 let old:Record<string,unknown>|null=null;
 if(method==="PATCH"){
 let find=db.from(conf.table).select("*").eq("id",id);
 if(profile.role==="manager")find=find.eq("branch",profile.branch||"__none__");
 const r=await find.maybeSingle();if(r.error)return response(r.error.message,500);if(!r.data)return response("Record not found",404);old=r.data;
 }
 const result=method==="POST"?await db.from(conf.table).insert(payload).select("*").single():await db.from(conf.table).update(payload).eq("id",id).select("*").single();
 if(result.error)return response(result.error.message,500);
 // Audit write is server-side and never sent from browser.
 const audit=await db.from("audit_logs").insert({actor_id:user.id,module:module,action:method==="POST"?"create":"update",record_table:conf.table,record_id:result.data.id,description:`${method==="POST"?"Created":"Updated"} ${module} record`,old_data:old,new_data:result.data});
 if(audit.error)console.error("HR audit insertion failed",audit.error.message);
 return NextResponse.json({item:result.data,auditRecorded:!audit.error});
 }catch(e){console.error(e);return response("Request failed",500)}
}
export async function GET(req:NextRequest,{params}:{params:Promise<{module:string}>}){return handler(req,params,"GET")}
export async function POST(req:NextRequest,{params}:{params:Promise<{module:string}>}){return handler(req,params,"POST")}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{module:string}>}){return handler(req,params,"PATCH")}
