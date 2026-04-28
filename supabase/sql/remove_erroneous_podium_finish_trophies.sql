begin;

delete from public.member_trophies
where trophy_id = 'top_3_month';

commit;

select
  trophy_id,
  count(*) as remaining_rows
from public.member_trophies
where trophy_id = 'top_3_month'
group by trophy_id;
