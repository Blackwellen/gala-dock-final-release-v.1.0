// BEO sections (§62), shared by the editor (client) and read-only views (server).
export const BEO_SECTIONS: [string, string, string][] = [
  ["event", "Event details", "Event name, client, type"], ["room", "Room / space", ""], ["times", "Times", "Access, setup, doors, service, finish, breakdown"],
  ["setup", "Setup", ""], ["layout", "Layout", "e.g. Banquet rounds of 10, top table, dance floor"], ["capacity", "Capacity / numbers", ""],
  ["catering", "Catering", "Menu, courses, service times, dietary counts"], ["bar", "Bar", "Bar model, hours, licensing"], ["av", "AV & production", ""],
  ["staffing", "Staffing", ""], ["access", "Access", ""], ["deliveries", "Deliveries", "Supplier delivery windows and loading"],
  ["contacts", "Client contacts", "Name, role, phone on the day"], ["supplier_access", "Supplier access", ""], ["special", "Special requirements", ""], ["accessibility", "Accessibility", ""],
];
export const BEO_FINANCIAL: [string, string][] = [["hire", "Venue hire"], ["catering", "Catering"], ["bar", "Bar"], ["extras", "Extras"], ["total", "Total"], ["deposit_paid", "Deposit paid"], ["balance_due", "Balance due"]];
