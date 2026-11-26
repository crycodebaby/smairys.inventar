set local lock_timeout = '2s';

create index inventory_items_owner_category_idx
  on public.inventory_items (owner_id, category_id);
