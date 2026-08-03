import type { JsonObject } from "../../contracts/src/index.js";

export type CrmChannelPartnerType = "Distributor" | "Dealer";
export type CrmChannelPartnerStatus = "Active" | "Inactive";

export interface CrmChannelPartnerData extends JsonObject {
  company: string;
  partner_name: string;
  partner_type: CrmChannelPartnerType;
  customer: string;
  territory?: string;
  assigned_to?: string;
  latitude?: string | number;
  longitude?: string | number;
  checkin_radius_m?: string | number;
  status?: CrmChannelPartnerStatus;
  notes?: string;
}

export type CrmSalesRouteStatus = "Draft" | "Active" | "Closed";

export interface CrmSalesRouteData extends JsonObject {
  company: string;
  route_name: string;
  salesperson: string;
  territory?: string;
  start_date: string;
  end_date: string;
  status?: CrmSalesRouteStatus;
  notes?: string;
}

export interface CrmSalesRouteStopData extends JsonObject {
  company: string;
  sales_route: string;
  sequence: number;
  partner: string;
  planned_date: string;
  notes?: string;
}

export type CrmFieldCheckInResult = "Inside Radius" | "Outside Radius" | "Location Unconfigured";

export interface CrmFieldCheckInData extends JsonObject {
  company: string;
  sales_route?: string;
  route_stop?: string;
  partner: string;
  salesperson: string;
  checked_in_at?: string;
  latitude: string | number;
  longitude: string | number;
  distance_m?: string;
  result?: CrmFieldCheckInResult;
  crm_activity?: string;
  notes?: string;
}

export type CrmSellOutStatus = "Draft" | "Confirmed" | "Cancelled";

export interface CrmSellOutLine extends JsonObject {
  row_id: string;
  item_code: string;
  qty: string | number;
  unit_price: string | number;
  qty_micros?: number;
  unit_price_minor?: number;
  amount?: string;
  amount_minor?: number;
}

export interface CrmSellOutReportData extends JsonObject {
  company: string;
  partner: string;
  report_date: string;
  currency: string;
  status?: CrmSellOutStatus;
  lines: CrmSellOutLine[];
  total_amount?: string;
  total_amount_minor?: number;
  notes?: string;
}
