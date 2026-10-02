"use client";

import { FormEvent, useEffect, useState } from "react";

type UserRow = { id:string; full_name:string|null; email:string|null; role:string; branch:string|null; employee_id:string|null; status:string|null; created_at:string|null };
const roles = ["hr_admin","hr_staff","manager","employee"];
const branches = ["Las Piñas","Mandaluyong","Quezon City","Mastermind Mandaluyong"];

export default function UsersPage() {
  const [users,setUsers] = useState<UserRow[]>([]);
  const [loading,setLoading] = useState(true);
  const [message,setMessage] = useState("");
  const [form,setForm] = useState({full_name:"",email:"",password:"",role:"employee",branch:"Las Piñas",employee_id:""});

  async function loadUsers(){
    setLoading(true); setMessage("");
    const res=await fetch("/api/admin/users",{cache:"no-store"});
    if(res.status===403){ location.href="/hr.html"; return; }
    const data=await res.json();
    if(!res.ok){ setMessage(data.error||"Unable to load users"); setLoading(false); return; }
    setUsers(data.users||[]); setLoading(false);
  }
  useEffect(()=>{loadUsers();},[]);

  async function createUser(e:FormEvent){
    e.preventDefault(); setMessage("");
    const res=await fetch("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
    const data=await res.json();
    if(!res.ok){setMessage(data.error||"Unable to create user");return;}
    setMessage("User account created successfully.");
    setForm({full_name:"",email:"",password:"",role:"employee",branch:"Las Piñas",employee_id:""});
    loadUsers();
  }

  async function updateUser(id:string, role:string, status:string, branch:string){
    setMessage("");
    const res=await fetch("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,role,status,branch})});
    const data=await res.json();
    if(!res.ok){setMessage(data.error||"Unable to update user");return;}
    setMessage("User updated."); loadUsers();
  }

  return <main className="admin-page"><div className="admin-wrap">
    <div className="admin-top"><div><h1>System Users</h1><p>Create and manage accounts allowed to sign in to the Underchargers HR System.</p></div><div className="admin-actions"><a className="soft-btn" href="/hr.html" style={{textDecoration:"none"}}>← Back to HR System</a><a className="danger-btn" href="/api/auth/logout" style={{textDecoration:"none"}}>Log Out</a></div></div>
    <div className="notice">Only <b>HR Admin</b> accounts can open this page. The employee HR records inside the current prototype are still stored in each browser's localStorage; Supabase Auth controls sign-in accounts.</div>
    <section className="panel"><h2 style={{marginTop:0}}>Create User</h2><form onSubmit={createUser} className="form-grid">
      <div className="field"><label>Full Name</label><input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required /></div>
      <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required /></div>
      <div className="field"><label>Temporary Password</label><input type="password" minLength={8} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required /></div>
      <div className="field"><label>Role</label><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{roles.map(r=><option key={r}>{r}</option>)}</select></div>
      <div className="field"><label>Branch</label><select value={form.branch} onChange={e=>setForm({...form,branch:e.target.value})}>{branches.map(b=><option key={b}>{b}</option>)}</select></div>
      <div className="field"><label>Employee ID (optional)</label><input value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})} placeholder="UC-0001" /></div>
      <div className="full"><button className="primary-btn" type="submit">+ Create User Account</button></div>
    </form>{message&&<div className="notice" style={{marginTop:12}}>{message}</div>}</section>
    <section className="panel"><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:12}}><div><h2 style={{margin:0}}>User Accounts</h2><p style={{margin:"4px 0 0",color:"#756d63",fontSize:12}}>Role, branch and account status can be changed here.</p></div><button className="soft-btn" onClick={loadUsers}>Refresh</button></div>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Employee ID</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {loading?<tr><td colSpan={7}>Loading users...</td></tr>:users.length===0?<tr><td colSpan={7}>No users found.</td></tr>:users.map(u=><UserEditableRow key={u.id} user={u} onSave={updateUser}/>) }
      </tbody></table></div>
    </section>
  </div></main>
}

function UserEditableRow({user,onSave}:{user:UserRow,onSave:(id:string,role:string,status:string,branch:string)=>void}){
  const [role,setRole]=useState(user.role||"employee");
  const [status,setStatus]=useState(user.status||"Active");
  const [branch,setBranch]=useState(user.branch||"Las Piñas");
  return <tr><td><b>{user.full_name||"Unnamed"}</b></td><td>{user.email||"-"}</td><td><select value={role} onChange={e=>setRole(e.target.value)}>{roles.map(r=><option key={r}>{r}</option>)}</select></td><td><select value={branch} onChange={e=>setBranch(e.target.value)}>{branches.map(b=><option key={b}>{b}</option>)}</select></td><td>{user.employee_id||"-"}</td><td><select value={status} onChange={e=>setStatus(e.target.value)}><option>Active</option><option>Inactive</option></select></td><td><div className="row-actions"><button className="soft-btn" onClick={()=>onSave(user.id,role,status,branch)}>Save</button></div></td></tr>
}
