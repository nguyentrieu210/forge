import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { CrmChannelPartnerController, CrmFieldCheckInController, CrmSalesRouteController, CrmSalesRouteStopController, CrmSellOutReportController } from "./crm-channel-controllers.js";
import { CrmActivityController } from "./crm-controllers.js";
import { CrmContactController, CrmOrganizationController } from "./crm-directory-controllers.js";
import { CrmConsentAwareMarketingListMemberController } from "./crm-marketing-consent-controller.js";
import { CrmCampaignAttributionController, CrmCampaignController, CrmMarketingListController, CrmSegmentController } from "./crm-marketing-controllers.js";
import { CrmCommissionAccrualController, CrmCommissionRuleController, CrmSalesTargetController } from "./crm-performance-controllers.js";
import { CrmLeadScoreRuleController, CrmLeadScoreSnapshotController } from "./crm-scoring-controllers.js";
import { CrmSalesTeamController, CrmSalesTeamMemberController, CrmTeamAwareDealController, CrmTeamAwareLeadController } from "./crm-team-controllers.js";
import { DeliveryNoteController, SalesInvoiceController, SalesOrderController } from "./controllers.js";
import { PaymentAllocationController } from "./finance-controllers.js";
import { QuotationController } from "./quotation-controller.js";
import { SafeFinancePaymentEntryController } from "./safe-finance-payment-entry.js";

export function createO2CControllerRegistry(): ControllerRegistry {
  return new ControllerRegistry()
    .register(new CrmTeamAwareLeadController())
    .register(new CrmTeamAwareDealController())
    .register(new CrmActivityController())
    .register(new CrmOrganizationController())
    .register(new CrmContactController())
    .register(new CrmSalesTeamController())
    .register(new CrmSalesTeamMemberController())
    .register(new CrmLeadScoreRuleController())
    .register(new CrmLeadScoreSnapshotController())
    .register(new CrmSalesTargetController())
    .register(new CrmCommissionRuleController())
    .register(new CrmCommissionAccrualController())
    .register(new CrmSegmentController())
    .register(new CrmMarketingListController())
    .register(new CrmConsentAwareMarketingListMemberController())
    .register(new CrmCampaignController())
    .register(new CrmCampaignAttributionController())
    .register(new CrmChannelPartnerController())
    .register(new CrmSalesRouteController())
    .register(new CrmSalesRouteStopController())
    .register(new CrmFieldCheckInController())
    .register(new CrmSellOutReportController())
    .register(new QuotationController())
    .register(new SalesOrderController())
    .register(new DeliveryNoteController())
    .register(new SalesInvoiceController())
    .register(new SafeFinancePaymentEntryController())
    .register(new PaymentAllocationController());
}
