insert into storage.buckets (id, name, public)
values ('fitflight-images', 'fitflight-images', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "fitflight_images_public_read" on storage.objects;
create policy "fitflight_images_public_read"
on storage.objects
for select
to public
using (bucket_id = 'fitflight-images');

drop policy if exists "fitflight_images_authenticated_upload" on storage.objects;
create policy "fitflight_images_authenticated_upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fitflight-images'
  and (
    name like 'avatars/%'
    or name like 'workout-proofs/%'
  )
);

drop policy if exists "fitflight_images_authenticated_update" on storage.objects;
create policy "fitflight_images_authenticated_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'fitflight-images'
  and (
    name like 'avatars/%'
    or name like 'workout-proofs/%'
  )
)
with check (
  bucket_id = 'fitflight-images'
  and (
    name like 'avatars/%'
    or name like 'workout-proofs/%'
  )
);

drop policy if exists "fitflight_images_authenticated_delete" on storage.objects;
create policy "fitflight_images_authenticated_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fitflight-images'
  and (
    name like 'avatars/%'
    or name like 'workout-proofs/%'
  )
);
