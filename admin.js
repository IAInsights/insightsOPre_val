/* Contacts Admin uses its own session; existing reporting authentication is untouched. */
const ADMIN_EMAIL='reporting@globe-groupe.com';
const ADMIN_SESSION_KEY='reporting_contacts_admin_session';
const ADMIN_ACTOR_KEY='reporting_contacts_admin_actor';
let adminData=null,adminActor='',adminEditing=null,adminBusy=false,adminRefreshPromise=null;
const adminEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function adminReadSession(){try{return JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY)||'null')}catch{return null}}
function adminStoreSession(s){sessionStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify({...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+s.expires_in}))}
async function adminToken(){
 const s=adminReadSession();if(!s?.access_token)throw new Error('Please sign in.');
 if(s.expires_at>Date.now()/1000+60)return s.access_token;
 if(adminRefreshPromise)return adminRefreshPromise;
 adminRefreshPromise=(async()=>{const r=await sbFetch(`${SB}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});if(!r.ok){sessionStorage.removeItem(ADMIN_SESSION_KEY);throw new Error('Your session expired. Please sign in again.')}const updated=await r.json();adminStoreSession(updated);return updated.access_token})();
 try{return await adminRefreshPromise}finally{adminRefreshPromise=null}
}
async function adminRpc(name,args={}){
 const r=await sbFetch(`${SB}/rest/v1/rpc/contacts_admin_${name}`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${await adminToken()}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
 if(!r.ok){let message='Unable to complete this action.';try{const e=await r.json();message=e.message||message}catch{}if(r.status===401){sessionStorage.removeItem(ADMIN_SESSION_KEY);message='Your session expired. Please sign in again.'}throw new Error(message)}return r.json();
}
function adminError(message){const e=document.getElementById('admin-error');if(e)e.textContent=message}
function adminOptions(items,current='',blank='Choose…'){return `<option value="">${adminEscape(blank)}</option>`+items.map(item=>`<option value="${adminEscape(item.id)}" ${String(item.id)===String(current)?'selected':''}>${adminEscape(item.name)}</option>`).join('')}
function adminLookup(items,id){return items.find(item=>String(item.id)===String(id))?.name||'—'}
function adminBrandsForClient(clientId){return (adminData?.brands||[]).filter(brand=>String(brand.client_id)===String(clientId)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))}
function adminBrandOptions(clientId,current=''){return adminOptions(adminBrandsForClient(clientId),current,'No preferred brand')}
function adminSortRetailers(items){return [...(items||[])].sort((a,b)=>Number(a.id)-Number(b.id)||String(a.id).localeCompare(String(b.id)))}
async function adminOpen(){
 if(adminBusy)return;
 if(!adminReadSession()){adminRenderLogin();return}
 adminBusy=true;const area=document.getElementById('admin-page');area.innerHTML='<p class="admin-status" role="status">Loading contacts…</p>';
 try{adminData=await adminRpc('bootstrap');adminActor=sessionStorage.getItem(ADMIN_ACTOR_KEY)||'';if(!adminData.commercials.some(c=>c.id===adminActor))adminActor='';adminActor?adminRenderWorkspace():adminRenderIdentity()}
 catch(error){if(!adminReadSession())adminRenderLogin();else area.innerHTML='<section class="admin-card"><h2>Admin</h2><p id="admin-error" class="admin-error" role="alert"></p><div class="admin-actions" style="margin-top:16px"><button class="mbtn primary" onclick="adminOpen()">Retry</button><button class="mbtn secondary" onclick="adminLogout()">Sign out</button></div></section>';adminError(error.message)}
 finally{adminBusy=false}
}
function adminRenderLogin(){document.getElementById('admin-page').innerHTML=`<section class="admin-card"><h2>Admin</h2><p class="admin-muted">Manage client contacts with the commercial team.</p><form id="admin-login" class="admin-form"><label>Team password<input name="password" type="password" autocomplete="current-password" required autofocus></label><button class="mbtn primary" type="submit">Sign in</button></form><p id="admin-error" class="admin-error" role="alert"></p></section>`;document.getElementById('admin-login').addEventListener('submit',adminLogin)}
async function adminLogin(event){event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;adminError('');try{
 const r=await sbFetch(`${SB}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({email:ADMIN_EMAIL,password:form.elements.password.value})});
 form.elements.password.value='';if(!r.ok)throw new Error('Sign-in failed. Check the team password and try again.');adminStoreSession(await r.json());await adminOpen();
 }catch(error){adminError(error.message)}finally{button.disabled=false}}
function adminRenderIdentity(){document.getElementById('admin-page').innerHTML=`<section class="admin-card"><h2>Who is working today?</h2><p class="admin-muted">Select your name to record your changes.</p><form id="admin-identity" class="admin-form"><label>Commercial<select name="actor" required>${adminOptions(adminData.commercials)}</select></label><button class="mbtn primary">Continue</button><button type="button" class="mbtn secondary" onclick="adminLogout()">Sign out</button></form></section>`;document.getElementById('admin-identity').onsubmit=event=>{event.preventDefault();adminActor=event.currentTarget.elements.actor.value;sessionStorage.setItem(ADMIN_ACTOR_KEY,adminActor);adminRenderWorkspace()}}
async function adminLogout(){const token=adminReadSession()?.access_token;sessionStorage.removeItem(ADMIN_SESSION_KEY);sessionStorage.removeItem(ADMIN_ACTOR_KEY);adminData=null;adminActor='';document.querySelectorAll('.admin-dialog').forEach(d=>d.remove());adminRenderLogin();if(token)try{await sbFetch(`${SB}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${token}`}})}catch{}}
function adminChangeIdentity(){sessionStorage.removeItem(ADMIN_ACTOR_KEY);adminActor='';adminRenderIdentity()}
function adminRenderWorkspace(){document.getElementById('admin-page').innerHTML=`<div class="admin-top"><div><h2>Client contacts</h2><p class="admin-muted">Working as ${adminEscape(adminLookup(adminData.commercials,adminActor))}</p></div><div class="admin-actions"><button class="mbtn secondary" onclick="adminChangeIdentity()">Change name</button><button class="mbtn secondary" onclick="adminOpen()">Refresh</button><button class="mbtn secondary" onclick="adminLogout()">Sign out</button><button class="mbtn secondary" id="admin-export" onclick="adminExportExcel()" title="Export contacts matching the current search and filters">Export Excel</button><button class="mbtn primary" onclick="adminEdit()">+ Add contact</button></div></div><div class="admin-toolbar"><input id="admin-search" type="search" aria-label="Search first name, last name or email" placeholder="Search first name, last name or email"><details class="admin-client-picker" id="admin-client-picker"><summary id="admin-client-label">All clients</summary><div class="admin-client-panel"><input type="search" id="admin-client-search" aria-label="Search clients" placeholder="Search clients…"><div id="admin-client-options" class="admin-client-options"></div></div></details><input type="hidden" id="admin-client" value=""><select id="admin-commercial" aria-label="Filter by commercial">${adminOptions(adminData.commercials,'','All commercials')}<option value="__none">Unassigned</option></select><select id="admin-visible" aria-label="Filter by visible"><option value="">All visibility</option><option value="true">Visible: TRUE</option><option value="false">Visible: FALSE</option><option value="unset">Visible: Not set</option></select></div><p id="admin-count" class="admin-status" role="status"></p><p id="admin-error" class="admin-error" role="alert"></p><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>First name</th><th>Last name</th><th>Email</th><th>Client</th><th>Preferred brand</th><th>Retailers</th><th>Commercial</th><th>Visible</th><th>Actions</th></tr></thead><tbody id="admin-rows"></tbody></table></div>`;
 ['admin-search','admin-commercial','admin-visible'].forEach(id=>document.getElementById(id).addEventListener(id==='admin-search'?'input':'change',adminRenderRows));document.getElementById('admin-client-search').addEventListener('input',adminRenderClientOptions);adminRenderClientOptions();adminRenderRows();
}
function adminFilteredContacts(contacts,query,client,commercial,visible=''){query=query.trim().toLocaleLowerCase();return contacts.filter(c=>(!query||[c.Fname,c.Lname,c.email].some(v=>String(v??'').toLocaleLowerCase().includes(query)))&&(!client||String(c.client_id)===client)&&(!commercial||(commercial==='__none'?!c.commercial:String(c.commercial)===commercial))&&(!visible||(visible==='unset'?c.active==null:c.active===(visible==='true'))))}
function adminClientMatches(clients,query){query=query.trim().toLocaleLowerCase();return clients.filter(c=>String(c.name??'').toLocaleLowerCase().includes(query))}
function adminRenderClientOptions(){
 const selected=document.getElementById('admin-client').value;
 const clients=adminClientMatches(adminData.clients,document.getElementById('admin-client-search').value);
 const options=document.getElementById('admin-client-options');
 options.innerHTML=`<button type="button" data-client="" aria-pressed="${selected===''}">All clients</button>`+clients.map(c=>`<button type="button" data-client="${adminEscape(c.id)}" aria-pressed="${selected===c.id}">${adminEscape(c.name)}</button>`).join('')+(!clients.length?'<p class="admin-muted">No clients found.</p>':'');
 options.querySelectorAll('[data-client]').forEach(button=>button.onclick=()=>{
  document.getElementById('admin-client').value=button.dataset.client;
  document.getElementById('admin-client-label').textContent=button.dataset.client?adminLookup(adminData.clients,button.dataset.client):'All clients';
  document.getElementById('admin-client-picker').open=false;
  adminRenderClientOptions();adminRenderRows();
 });
}
function adminVisibleRows(){return adminFilteredContacts(adminData.contacts,document.getElementById('admin-search').value,document.getElementById('admin-client').value,document.getElementById('admin-commercial').value,document.getElementById('admin-visible').value)}
function adminExportValues(rows,data){return [['Contact ID','First name','Last name','Email','Client','Preferred brand','Retailers','Commercial','Visible'],...rows.map(c=>[String(c.id),c.Fname||'',c.Lname||'',c.email||'',adminLookup(data.clients,c.client_id),adminLookup(data.brands||[],c.brand_preference_id),c.retailer_ids.map(id=>adminLookup(data.retailers,id)).join('; '),adminLookup(data.commercials,c.commercial),c.active===true?'TRUE':c.active===false?'FALSE':''])]}
function adminExportExcel(){
 if(!adminData||!adminActor)return;
 if(typeof XLSX==='undefined'){toast('Excel export is unavailable. Refresh and try again.','error');return}
 const rows=adminVisibleRows();if(!rows.length){toast('No contacts match your filters.');return}
 try{
  const sheet=XLSX.utils.aoa_to_sheet(adminExportValues(rows,adminData));
  sheet['!cols']=[{wch:14},{wch:22},{wch:24},{wch:42},{wch:30},{wch:30},{wch:48},{wch:30},{wch:12}];
  sheet['!autofilter']={ref:sheet['!ref']};
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Contacts');
  XLSX.writeFile(book,`Contacts_${new Date().toISOString().slice(0,10)}.xlsx`);
  toast(`${rows.length} contacts exported`,'success');
 }catch{toast('Excel export failed. Please try again.','error')}
}
function adminRenderRows(){
 const rows=adminVisibleRows();
 const exportButton=document.getElementById('admin-export');if(exportButton)exportButton.disabled=!rows.length;
 document.getElementById('admin-count').textContent=`${rows.length} of ${adminData.contacts.length} contacts`;
 document.getElementById('admin-rows').innerHTML=rows.map(c=>`<tr class="${c.active===false?'admin-inactive':''}"><td>${adminEscape(c.Fname)}</td><td>${adminEscape(c.Lname)}</td><td>${adminEscape(c.email)}</td><td>${adminEscape(adminLookup(adminData.clients,c.client_id))}</td><td>${adminEscape(adminLookup(adminData.brands||[],c.brand_preference_id))}</td><td>${adminEscape(c.retailer_ids.map(id=>`ID ${id} · ${adminLookup(adminData.retailers,id)}`).join(', ')||'—')}</td><td>${adminEscape(adminLookup(adminData.commercials,c.commercial))}</td><td><span class="admin-badge ${c.active===false?'off':''}">${c.active===true?'TRUE':c.active===false?'FALSE':'Not set'}</span></td><td><button class="mbtn secondary" data-edit="${adminEscape(c.id)}">Edit</button> <button class="mbtn secondary" data-history="${adminEscape(c.id)}">History</button></td></tr>`).join('')||'<tr><td colspan="9">No contacts match your filters.</td></tr>';
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>adminEdit(b.dataset.edit));document.querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>adminHistory(b.dataset.history));
}
function adminDialog(title){const d=document.createElement('dialog');d.className='admin-dialog';d.innerHTML=`<h3>${adminEscape(title)}</h3>`;document.body.appendChild(d);d.addEventListener('close',()=>d.remove());return d}
function adminEdit(id){
 adminEditing=id?adminData.contacts.find(c=>c.id===id):null;const c=adminEditing||{Fname:'',Lname:'',email:'',client_id:'',commercial:adminActor,active:true,brand_preference_id:null,retailer_ids:[]};const d=adminDialog(id?'Edit contact':'Add contact');
 d.insertAdjacentHTML('beforeend',`<form class="admin-form admin-form-grid"><label>First name<input name="Fname" value="${adminEscape(c.Fname)}" required maxlength="200"></label><label>Last name<input name="Lname" value="${adminEscape(c.Lname)}" required maxlength="200"></label><label class="admin-wide">Email<input name="email" type="email" value="${adminEscape(c.email)}" required maxlength="320"></label><label>Client<select name="client_id" required>${adminOptions(adminData.clients,c.client_id)}</select></label><label>Preferred brand<select name="brand_preference_id">${adminBrandOptions(c.client_id,c.brand_preference_id)}</select></label><label>Commercial<select name="commercial">${adminOptions(adminData.commercials,c.commercial,'Unassigned')}</select></label><label>Visible<select name="active" required><option value="">Choose…</option><option value="true" ${c.active===true?'selected':''}>TRUE</option><option value="false" ${c.active===false?'selected':''}>FALSE</option></select></label><fieldset class="admin-retailers admin-wide"><legend>Retailers</legend>${adminSortRetailers(adminData.retailers).map(r=>`<label><input type="checkbox" name="retailer" value="${adminEscape(r.id)}" ${c.retailer_ids.includes(r.id)?'checked':''}>ID ${adminEscape(r.id)} · ${adminEscape(r.name)}</label>`).join('')}</fieldset>${c.Retailer?`<p class="admin-muted admin-wide">Historical retailer: ${adminEscape(adminLookup(adminData.retailers,c.Retailer))}. Edit the retailer associations above.</p>`:''}<p class="admin-error admin-wide" role="alert"></p><div class="mfoot admin-wide"><button type="button" class="mbtn secondary" data-cancel>Cancel</button><button class="mbtn primary" type="submit">Save contact</button></div></form>`);
 const form=d.querySelector('form');form.elements.client_id.onchange=()=>{form.elements.brand_preference_id.innerHTML=adminBrandOptions(form.elements.client_id.value,'')};d.querySelector('[data-cancel]').onclick=()=>d.close();form.onsubmit=event=>adminSave(event,d);d.showModal();
}
async function adminSave(event,d){event.preventDefault();const form=event.currentTarget,error=form.querySelector('.admin-error'),buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);error.textContent='';const contact=adminEditing;try{
 const payload={id:contact?.id||null,Fname:form.elements.Fname.value.trim(),Lname:form.elements.Lname.value.trim(),email:form.elements.email.value.trim(),client_id:form.elements.client_id.value,commercial:form.elements.commercial.value||null,active:form.elements.active.value==='true',brand_preference_id:form.elements.brand_preference_id.value||null,retailer_ids:[...form.querySelectorAll('[name=retailer]:checked')].map(c=>c.value)};
 await adminRpc('save',{p_contact:payload,p_actor:adminActor,p_version:contact?.admin_version??null});d.close();toast('Contact saved','success');
 try{adminData=await adminRpc('bootstrap');adminRenderRows()}catch{adminError('Contact saved. Refresh to display the latest data.');}
 }catch(e){error.textContent=e.message}finally{buttons.forEach(b=>b.disabled=false)}}
function adminHistoryValue(key,value){if(key==='client_id')return adminLookup(adminData.clients,value);if(key==='commercial')return adminLookup(adminData.commercials,value);if(key==='brand_preference_id')return adminLookup(adminData.brands||[],value);if(key==='retailer_ids')return (value||[]).map(id=>adminLookup(adminData.retailers,id)).join(', ')||'—';if(key==='active')return value===true?'TRUE':value===false?'FALSE':'Not set';return String(value??'—')}
async function adminHistory(id){const d=adminDialog('Contact history');d.insertAdjacentHTML('beforeend','<div data-history-body role="status">Loading history…</div><div class="mfoot"><button class="mbtn secondary">Close</button></div>');d.querySelector('button').onclick=()=>d.close();d.showModal();const body=d.querySelector('[data-history-body]');try{
 const entries=await adminRpc('history',{p_id:id});const labels={Fname:'First name',Lname:'Last name',email:'Email',client_id:'Client',commercial:'Commercial',brand_preference_id:'Preferred brand',active:'Visible',retailer_ids:'Retailers'};
 body.innerHTML=entries.map(e=>`<section class="admin-history-entry"><strong>${e.action==='CREATE'?'Created':'Updated'} by ${adminEscape(e.actor_name)}</strong><p class="admin-muted">${adminEscape(new Date(e.changed_at).toLocaleString())}</p><ul>${Object.entries(labels).filter(([key])=>!e.before_values||JSON.stringify(e.before_values[key])!==JSON.stringify(e.after_values[key])).map(([key,label])=>`<li>${label}: ${e.before_values?adminEscape(adminHistoryValue(key,e.before_values[key]))+' → ':''}${adminEscape(adminHistoryValue(key,e.after_values[key]))}</li>`).join('')||'<li>No contact fields changed.</li>'}</ul></section>`).join('')||'<p class="admin-status">No changes recorded since Admin was introduced.</p>';
 }catch(e){body.textContent=e.message;body.className='admin-error'}}
