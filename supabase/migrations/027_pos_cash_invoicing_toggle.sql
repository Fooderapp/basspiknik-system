-- Toggle: issue Billingo invoices for POS cash sales.
-- Terminal (card) POS sales and online sales are always invoiced; cash can be
-- turned off here (e.g. when cash takings are handled outside the invoicing flow).
alter table app_settings
  add column if not exists invoice_pos_cash boolean not null default true;
