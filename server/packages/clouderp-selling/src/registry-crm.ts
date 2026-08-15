import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { CrmChannelPartnerController, CrmFieldCheckInController, CrmSalesRouteController, CrmSalesRouteStopController, CrmSellOutReportController } from "./crm-channel-controllers.js";
import { CrmGeoVerifiedPromotionExecutionController, CrmSubmittedSellInSnapshotController } from "./crm-channel-evidence-guards.js";
import { CrmActivityController } from "./crm-controllers.js";
import { CrmCustomer360Controller } from "./crm-customer-360-controller.js";
import { CrmContactController, CrmOrganizationController } from "./crm-directory-controllers.js";
import { CrmDeduplicatingLeadController } from "./crm-lead-dedupe-controller.js";
import { CrmConsentAwareMarketingListMemberController } from "./crm-marketing-consent-controller.js";
import { CrmCampaignAttributionController, CrmCampaignController, CrmMarketingListController, CrmSegmentController } from "./crm-marketing-controllers.js";
import { CrmCommissionAccrualController, CrmCommissionRuleController, CrmSalesTargetController } from "./crm-performance-controllers.js";
import { CrmLeadScoreRuleController, CrmLeadScoreSnapshotController } from "./crm-scoring-controllers.js";
import { CrmSalesTeamController, CrmSalesTeamMemberController, CrmTeamAwareDealController } from "./crm-team-controllers.js";

export function registerCrmControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new CrmDeduplicatingLeadController())
    .register(new CrmTeamAwareDealController())
    .register(new CrmActivityController())
    .register(new CrmCustomer360Controller())
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
    .register(new CrmSubmittedSellInSnapshotController())
    .register(new CrmGeoVerifiedPromotionExecutionController());
}
