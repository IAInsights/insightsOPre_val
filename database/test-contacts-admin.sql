-- Execute after the setup SQL inside a transaction; always rollback fixtures.
do $$
declare p jsonb; cid text; actor bigint; client bigint; retailers jsonb; doc jsonb;
begin
 if has_table_privilege('anon','public."C_contacts"','SELECT') or has_table_privilege('authenticated','public."C_contacts"','DELETE') or has_table_privilege('authenticated','public."C_contacts"','UPDATE') then raise exception 'Direct contact API access remains'; end if;
 if has_function_privilege('anon','public.contacts_admin_save(jsonb,bigint,bigint)','EXECUTE') then raise exception 'Anonymous RPC access remains'; end if;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.contacts_admin_bootstrap(); raise exception 'Anonymous bootstrap allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 begin perform public.contacts_admin_bootstrap(); raise exception 'Other account allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims','{"sub":"8e8802b9-8035-4f52-bb42-0a0ff9214351","role":"authenticated"}',true);
 doc=public.contacts_admin_bootstrap();
 if jsonb_array_length(doc->'contacts')<>(select count(*) from public."C_contacts") then raise exception 'Contact export incomplete'; end if;
 select id into actor from public."Contacts_Operations" where lower(btrim(jobtitle))='account manager' order by id limit 1;
 select id into client from public."GI_clients" order by id limit 1;
 select jsonb_agg(id::text) into retailers from (select id from public.retailers order by id limit 2)t;
 p=jsonb_build_object('Fname','AdminTest','Lname','Temporary','email','admin-test@example.invalid','client_id',client::text,'commercial',actor::text,'active',true,'retailer_ids',retailers);
 cid=public.contacts_admin_save(p,actor,null);
 if (select count(*) from public.contact_retailers where contact_id=cid::bigint)<>2 then raise exception 'Multiple retailers missing'; end if;
 p=p||jsonb_build_object('id',cid,'active',false,'retailer_ids','[]'::jsonb);
 perform public.contacts_admin_save(p,actor,0);
 if (select active from public."C_contacts" where id=cid::bigint) is distinct from false then raise exception 'Visibility update failed'; end if;
 if exists(select 1 from public.contact_retailers where contact_id=cid::bigint) then raise exception 'Retailer removal failed'; end if;
 begin perform public.contacts_admin_save(p,actor,0);raise exception 'Stale update allowed'; exception when serialization_failure then null;end;
 if jsonb_array_length(public.contacts_admin_history(cid::bigint))<>2 then raise exception 'Audit missing'; end if;
 if exists(select 1 from contacts_admin.audit where contact_id=cid::bigint and (actor_name is null or actor_user_id<>'8e8802b9-8035-4f52-bb42-0a0ff9214351')) then raise exception 'Audit actor wrong';end if;
end $$;
