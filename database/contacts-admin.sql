-- Run once in ReportingDB. Dedicated RPCs keep contact writes atomic and audited.
begin;
create schema if not exists contacts_admin;
revoke all on schema contacts_admin from public, anon;
grant usage on schema contacts_admin to authenticated;
create table contacts_admin.allowed_users(user_id uuid primary key references auth.users(id));
insert into contacts_admin.allowed_users values ('8e8802b9-8035-4f52-bb42-0a0ff9214351');
revoke all on contacts_admin.allowed_users from public,anon,authenticated;
alter table public."C_contacts" add column commercial bigint references public."Contacts_Operations"(id);
alter table public."C_contacts" add column admin_version bigint not null default 0;
create index contacts_commercial_idx on public."C_contacts"(commercial);
create table contacts_admin.audit (
 id bigint generated always as identity primary key,
 contact_id bigint not null, action text not null check(action in ('CREATE','UPDATE')),
 actor_user_id uuid not null, actor_commercial_id bigint not null,
 actor_name text not null, changed_at timestamptz not null default now(),
 before_values jsonb, after_values jsonb not null
);
create index contacts_admin_audit_contact_idx on contacts_admin.audit(contact_id,changed_at desc);
alter table contacts_admin.allowed_users enable row level security;
alter table contacts_admin.audit enable row level security;
revoke all on contacts_admin.audit from public,anon,authenticated;
-- Contact data is available only through the account-restricted RPCs below.
alter table public."C_contacts" enable row level security;
revoke all on public."C_contacts" from anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.contact_retailers from anon,authenticated;

create function contacts_admin.check_access() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from contacts_admin.allowed_users where user_id=auth.uid()) then
  raise exception 'Admin access denied' using errcode='42501';
 end if;
end $$;

create function contacts_admin.bootstrap() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform contacts_admin.check_access();
 return jsonb_build_object(
 'contacts',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('id',c.id::text,'client_id',c.client_id::text,'commercial',c.commercial::text,'retailer_ids',(select coalesce(jsonb_agg(cr.retailer_id::text order by cr.retailer_id),'[]') from public.contact_retailers cr where cr.contact_id=c.id)) order by c."Lname",c."Fname",c.id),'[]') from public."C_contacts" c),
 'clients',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'name',client) order by client),'[]') from public."GI_clients"),
 'retailers',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'name',retailer) order by retailer),'[]') from public.retailers),
 'commercials',(select coalesce(jsonb_agg(jsonb_build_object('id',id::text,'name',concat_ws(' ',firstname,lastname)) order by lastname,firstname),'[]') from public."Contacts_Operations" where lower(btrim(jobtitle))='account manager')
 );
end $$;

create function contacts_admin.save_contact(p_contact jsonb,p_actor bigint,p_version bigint) returns text
language plpgsql security definer set search_path='' as $$
declare
 v_id bigint; v_old public."C_contacts"%rowtype; v_new public."C_contacts"%rowtype;
 v_before jsonb; v_after jsonb; v_actor_name text; v_action text; v_retailers bigint[];
begin
 perform contacts_admin.check_access();
 select concat_ws(' ',firstname,lastname) into v_actor_name from public."Contacts_Operations"
 where id=p_actor and lower(btrim(jobtitle))='account manager';
 if not found then raise exception 'Choose an Account manager'; end if;
 if nullif(btrim(p_contact->>'Fname'),'') is null or nullif(btrim(p_contact->>'Lname'),'') is null then raise exception 'First and last names are required'; end if;
 if coalesce(p_contact->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A valid email is required'; end if;
 if jsonb_typeof(p_contact->'active') is distinct from 'boolean' then raise exception 'Visible must be TRUE or FALSE'; end if;
 if not exists(select 1 from public."GI_clients" where id=(p_contact->>'client_id')::bigint) then raise exception 'Choose a valid client'; end if;
 if nullif(p_contact->>'commercial','') is not null and not exists(select 1 from public."Contacts_Operations" where id=(p_contact->>'commercial')::bigint and lower(btrim(jobtitle))='account manager') then raise exception 'Choose a valid commercial'; end if;
 if jsonb_typeof(p_contact->'retailer_ids') is distinct from 'array' then raise exception 'Retailers must be a list'; end if;
 select coalesce(array_agg(distinct value::bigint),'{}') into v_retailers from jsonb_array_elements_text(p_contact->'retailer_ids');
 if exists(select 1 from unnest(v_retailers) rid where not exists(select 1 from public.retailers where id=rid)) then raise exception 'Unknown retailer'; end if;
 -- Serialize allocation because the legacy contact ID has no sequence/default.
 lock table public."C_contacts" in share row exclusive mode;
 v_id=nullif(p_contact->>'id','')::bigint;
 if v_id is null then
  select coalesce(max(id),0)+1 into v_id from public."C_contacts";
  v_action='CREATE';
  insert into public."C_contacts"(id,"Fname","Lname",email,client_id,active,commercial)
  values(v_id,btrim(p_contact->>'Fname'),btrim(p_contact->>'Lname'),btrim(p_contact->>'email'),(p_contact->>'client_id')::bigint,(p_contact->>'active')::boolean,nullif(p_contact->>'commercial','')::bigint);
 else
  select * into v_old from public."C_contacts" where id=v_id for update;
  if not found then raise exception 'Contact no longer exists'; end if;
  if p_version is null or p_version<>v_old.admin_version then raise exception 'This contact changed. Refresh and reopen it before saving.' using errcode='40001'; end if;
  v_action='UPDATE';
  v_before=to_jsonb(v_old)||jsonb_build_object('retailer_ids',(select coalesce(jsonb_agg(retailer_id order by retailer_id),'[]') from public.contact_retailers where contact_id=v_id));
  update public."C_contacts" set "Fname"=btrim(p_contact->>'Fname'),"Lname"=btrim(p_contact->>'Lname'),email=btrim(p_contact->>'email'),client_id=(p_contact->>'client_id')::bigint,active=(p_contact->>'active')::boolean,commercial=nullif(p_contact->>'commercial','')::bigint,admin_version=admin_version+1 where id=v_id;
 end if;
 delete from public.contact_retailers where contact_id=v_id and not(retailer_id=any(v_retailers));
 insert into public.contact_retailers(contact_id,retailer_id) select v_id,rid from unnest(v_retailers) rid on conflict do nothing;
 select * into v_new from public."C_contacts" where id=v_id;
 v_after=to_jsonb(v_new)||jsonb_build_object('retailer_ids',(select coalesce(jsonb_agg(retailer_id order by retailer_id),'[]') from public.contact_retailers where contact_id=v_id));
 insert into contacts_admin.audit(contact_id,action,actor_user_id,actor_commercial_id,actor_name,before_values,after_values)
 values(v_id,v_action,auth.uid(),p_actor,v_actor_name,v_before,v_after);
 return v_id::text;
end $$;

create function contacts_admin.history(p_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform contacts_admin.check_access();
 return (select coalesce(jsonb_agg(to_jsonb(a) order by a.changed_at desc,a.id desc),'[]') from contacts_admin.audit a where a.contact_id=p_id);
end $$;

-- Public wrappers are invokers. Elevated implementations live in a non-exposed schema.
create function public.contacts_admin_bootstrap() returns jsonb language sql security invoker set search_path='' as $$select contacts_admin.bootstrap()$$;
create function public.contacts_admin_save(p_contact jsonb,p_actor bigint,p_version bigint) returns text language sql security invoker set search_path='' as $$select contacts_admin.save_contact(p_contact,p_actor,p_version)$$;
create function public.contacts_admin_history(p_id bigint) returns jsonb language sql security invoker set search_path='' as $$select contacts_admin.history(p_id)$$;
revoke all on function contacts_admin.check_access(),contacts_admin.bootstrap(),contacts_admin.save_contact(jsonb,bigint,bigint),contacts_admin.history(bigint) from public,anon,authenticated;
grant execute on function contacts_admin.bootstrap(),contacts_admin.save_contact(jsonb,bigint,bigint),contacts_admin.history(bigint) to authenticated;
revoke all on function public.contacts_admin_bootstrap(),public.contacts_admin_save(jsonb,bigint,bigint),public.contacts_admin_history(bigint) from public,anon,authenticated;
grant execute on function public.contacts_admin_bootstrap(),public.contacts_admin_save(jsonb,bigint,bigint),public.contacts_admin_history(bigint) to authenticated;
notify pgrst,'reload schema';
commit;
