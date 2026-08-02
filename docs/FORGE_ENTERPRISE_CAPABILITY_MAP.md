# FORGE ENTERPRISE CAPABILITY MAP

> **Target checklist, not live status.**
>
> North Star: `FORGE_ENTERPRISE_NORTH_STAR.md`  
> Execution skill: `../skills/forge-enterprise-completion/SKILL.md`
>
> Không tick capability chỉ vì có màn hình/DocType. Maturity thực tế phải ghi bằng evidence trong `CURRENT_STATUS.md` hoặc tài liệu chuyên đề.

## Cách dùng

Mỗi capability có ID ổn định để task/PR/test có thể tham chiếu. Khi mở một task lớn:

1. chọn các capability ID bị tác động;
2. audit exact code hiện tại;
3. xác định maturity `Missing/Foundation/Wired/RC/Hardened`;
4. đóng một vertical slice end-to-end;
5. ghi evidence và cập nhật live status.

---

# F — FINANCE, ACCOUNTING & CONTROL

## F01 General Ledger & Period Control

- `F01-001` Chart of Accounts.
- `F01-002` Account hierarchy.
- `F01-003` Journal Entry.
- `F01-004` Journal templates.
- `F01-005` Opening balances.
- `F01-006` Fiscal year.
- `F01-007` Accounting period.
- `F01-008` Soft close.
- `F01-009` Hard lock.
- `F01-010` Adjustment entries.
- `F01-011` Closing entries.
- `F01-012` Year-end closing.
- `F01-013` Retained earnings.
- `F01-014` Trial Balance.
- `F01-015` General Ledger report.
- `F01-016` Balance Sheet.
- `F01-017` Profit & Loss.
- `F01-018` Cash Flow Statement.
- `F01-019` Accounting dimensions.
- `F01-020` Cost center dimension.
- `F01-021` Project dimension.
- `F01-022` Branch dimension.
- `F01-023` Warehouse dimension where legally appropriate.
- `F01-024` Immutable posting trace.
- `F01-025` Reversal/correction semantics.

## F02 Accounts Receivable

- `F02-001` Customer account.
- `F02-002` Sales Invoice posting.
- `F02-003` Customer advance.
- `F02-004` Payment schedule.
- `F02-005` Payment allocation.
- `F02-006` Partial payment.
- `F02-007` Overpayment.
- `F02-008` Credit note.
- `F02-009` Debit note.
- `F02-010` Write-off.
- `F02-011` Bad debt.
- `F02-012` AR aging.
- `F02-013` Customer statement.
- `F02-014` Credit limit.
- `F02-015` Credit hold.
- `F02-016` Collection reminder.
- `F02-017` Customer reconciliation.
- `F02-018` Multi-currency receivable.

## F03 Accounts Payable

- `F03-001` Supplier account.
- `F03-002` Purchase Invoice posting.
- `F03-003` Supplier advance.
- `F03-004` Payment request.
- `F03-005` Scheduled payment.
- `F03-006` Partial supplier payment.
- `F03-007` Supplier credit/debit adjustment.
- `F03-008` AP aging.
- `F03-009` Supplier statement.
- `F03-010` Supplier reconciliation.
- `F03-011` Withholding tax support.
- `F03-012` Payable forecast.
- `F03-013` Multi-currency payable.

## F04 Cash, Bank & Treasury

- `F04-001` Cash account.
- `F04-002` Bank account.
- `F04-003` Payment Entry.
- `F04-004` Cash receipt/payment.
- `F04-005` Warehouse/petty cash fund.
- `F04-006` Cash transfer.
- `F04-007` Cash count/handover.
- `F04-008` Bank statement import.
- `F04-009` Bank transaction.
- `F04-010` Manual reconciliation.
- `F04-011` Auto matching.
- `F04-012` Partial reconciliation.
- `F04-013` Reversible reconciliation.
- `F04-014` Bank feed connector.
- `F04-015` Payment batch.
- `F04-016` Payment approval.
- `F04-017` Cheque/reference tracking.
- `F04-018` Treasury dashboard.
- `F04-019` Cash position.
- `F04-020` Cash-flow forecast.

## F05 Budget, Forecast & Management Accounting

- `F05-001` Annual budget.
- `F05-002` Department budget.
- `F05-003` Cost-center budget.
- `F05-004` Project budget.
- `F05-005` Branch budget.
- `F05-006` Budget approval.
- `F05-007` Budget revision.
- `F05-008` Commitment.
- `F05-009` Encumbrance.
- `F05-010` Budget vs actual.
- `F05-011` Rolling forecast.
- `F05-012` Scenario forecast.
- `F05-013` Management P&L.
- `F05-014` Contribution margin.
- `F05-015` Cost allocation.
- `F05-016` Profit center.

## F06 Multi-company, Intercompany & Consolidation

- `F06-001` Multi-company.
- `F06-002` Legal entity.
- `F06-003` Business unit.
- `F06-004` Intercompany sale/purchase.
- `F06-005` Intercompany transfer.
- `F06-006` Due-to/due-from reconciliation.
- `F06-007` Elimination entries.
- `F06-008` Group currency.
- `F06-009` FX translation.
- `F06-010` Consolidated Trial Balance.
- `F06-011` Consolidated P&L.
- `F06-012` Consolidated Balance Sheet.

## F07 Currency & Revenue Recognition

- `F07-001` Currency master.
- `F07-002` Exchange rate source.
- `F07-003` Transaction currency.
- `F07-004` Base currency.
- `F07-005` FX gain/loss.
- `F07-006` Revaluation.
- `F07-007` Deferred revenue.
- `F07-008` Revenue schedule.
- `F07-009` Revenue recognition adjustment.

---

# V — VIETNAM STATUTORY & COMPLIANCE

## V01 Vietnam Accounting Pack

- `V01-001` TT99 chart/rules where applicable.
- `V01-002` TT133 chart/rules where applicable.
- `V01-003` Vietnam statutory account mappings.
- `V01-004` Required ledgers/books.
- `V01-005` Voucher numbering rules.
- `V01-006` Accounting document templates.
- `V01-007` Statutory financial statements.
- `V01-008` Accounting retention policy.
- `V01-009` Legal adjustment trace.

## V02 VAT / CIT / PIT

- `V02-001` VAT input ledger.
- `V02-002` VAT output ledger.
- `V02-003` Deductible/non-deductible classification.
- `V02-004` Invoice-tax reconciliation.
- `V02-005` VAT return dataset.
- `V02-006` VAT adjustment.
- `V02-007` CIT deductible-expense rules.
- `V02-008` CIT adjustments.
- `V02-009` Provisional CIT.
- `V02-010` Annual CIT settlement dataset.
- `V02-011` PIT resident/non-resident.
- `V02-012` Progressive PIT.
- `V02-013` Dependents/deductions.
- `V02-014` PIT annual settlement dataset.

## V03 Social Insurance & Payroll Compliance

- `V03-001` BHXH contribution basis.
- `V03-002` BHYT contribution.
- `V03-003` BHTN contribution.
- `V03-004` Contribution caps/floors.
- `V03-005` Effective-dated contribution rates.
- `V03-006` Increase/decrease declaration dataset.
- `V03-007` Payroll legal-rule selection by effective date.
- `V03-008` Versioned formula schema.
- `V03-009` Official legal source evidence.
- `V03-010` Statutory regression fixtures.

## V04 E-invoice, Tax, E-sign

- `V04-001` E-invoice provider abstraction.
- `V04-002` Invoice issue.
- `V04-003` Invoice adjustment.
- `V04-004` Invoice replacement.
- `V04-005` Invoice cancellation.
- `V04-006` E-invoice status synchronization.
- `V04-007` Digital signing.
- `V04-008` Tax filing connector seam.
- `V04-009` Certified-provider evidence boundary.
- `V04-010` Submission audit/queue/idempotency.

---

# C — CRM, SALES & REVENUE

## C01 CRM Core

- `C01-001` Lead.
- `C01-002` Contact.
- `C01-003` Account/Customer.
- `C01-004` Opportunity.
- `C01-005` Pipeline stage.
- `C01-006` Probability.
- `C01-007` Activity timeline.
- `C01-008` Call.
- `C01-009` Email activity.
- `C01-010` Meeting.
- `C01-011` Follow-up/task.
- `C01-012` Customer 360.
- `C01-013` Lead source.
- `C01-014` Duplicate detection/merge.
- `C01-015` Lead scoring.
- `C01-016` Win/loss analysis.
- `C01-017` Sales forecast.
- `C01-018` Territory.
- `C01-019` Salesperson/team.
- `C01-020` Sales target/quota.
- `C01-021` Commission.

## C02 Marketing & Growth

- `C02-001` Campaign.
- `C02-002` Customer segment.
- `C02-003` Marketing list.
- `C02-004` Email campaign.
- `C02-005` Marketing automation rule.
- `C02-006` Attribution/source tracking.
- `C02-007` Promotion campaign.
- `C02-008` Conversion funnel.
- `C02-009` Consent/unsubscribe.

## C03 Order-to-Cash

- `C03-001` Quotation.
- `C03-002` Quotation version.
- `C03-003` Sales contract.
- `C03-004` Sales Order.
- `C03-005` Delivery schedule.
- `C03-006` Delivery Note.
- `C03-007` Sales Invoice.
- `C03-008` Customer Payment.
- `C03-009` Partial delivery.
- `C03-010` Partial invoice.
- `C03-011` Partial payment.
- `C03-012` Sales return.
- `C03-013` Exchange.
- `C03-014` Credit note.
- `C03-015` Price list.
- `C03-016` Pricing rule.
- `C03-017` Promotion.
- `C03-018` Discount approval.
- `C03-019` Payment terms.
- `C03-020` Credit limit/hold.
- `C03-021` Warranty.
- `C03-022` Subscription.
- `C03-023` Recurring billing.
- `C03-024` Sales analytics.

## C04 Distribution / Dealer / Field Sales

- `C04-001` Distributor.
- `C04-002` Dealer.
- `C04-003` Sell-in.
- `C04-004` Sell-out.
- `C04-005` Field visit.
- `C04-006` Geo check-in.
- `C04-007` Sales route.
- `C04-008` Promotion execution.
- `C04-009` Mobile order capture.

---

# P — PROCUREMENT / SOURCE-TO-PAY

## P01 Procurement Core

- `P01-001` Purchase Request.
- `P01-002` Material Request.
- `P01-003` RFQ.
- `P01-004` Supplier Quotation.
- `P01-005` Quotation comparison.
- `P01-006` Supplier selection.
- `P01-007` Purchase approval.
- `P01-008` Purchase Order.
- `P01-009` Delivery schedule.
- `P01-010` Purchase Receipt.
- `P01-011` Purchase Invoice.
- `P01-012` Supplier Payment.
- `P01-013` Partial receipt.
- `P01-014` Partial invoice.
- `P01-015` Return to supplier.
- `P01-016` Landed cost.
- `P01-017` Three-way match.
- `P01-018` Quantity variance.
- `P01-019` Price variance.
- `P01-020` Purchase analytics.

## P02 Supplier Management

- `P02-001` Supplier onboarding.
- `P02-002` Approved supplier list.
- `P02-003` Supplier category.
- `P02-004` Supplier rating.
- `P02-005` Supplier quality score.
- `P02-006` Supplier price history.
- `P02-007` Supplier contract.
- `P02-008` Blanket order.
- `P02-009` Supplier portal.
- `P02-010` Supplier debt/provisional AP tracking where required.

---

# W — INVENTORY & WMS

## W01 Inventory Core

- `W01-001` Item master.
- `W01-002` Item group.
- `W01-003` Variant/attribute.
- `W01-004` UOM/conversion.
- `W01-005` Warehouse.
- `W01-006` Warehouse hierarchy.
- `W01-007` Stock Entry.
- `W01-008` Material Receipt.
- `W01-009` Material Issue.
- `W01-010` Stock Transfer.
- `W01-011` Stock Reconciliation.
- `W01-012` Stock Ledger.
- `W01-013` FIFO valuation.
- `W01-014` Moving Average valuation.
- `W01-015` Standard cost where applicable.
- `W01-016` Batch.
- `W01-017` Serial.
- `W01-018` Expiry.
- `W01-019` Stock reservation.
- `W01-020` Available-to-promise.
- `W01-021` Landed cost allocation.
- `W01-022` Valuation adjustment.
- `W01-023` Backdated stock semantics.
- `W01-024` Repost/replay.
- `W01-025` Returns.
- `W01-026` Stock aging.
- `W01-027` ABC analysis.
- `W01-028` Slow/dead stock.
- `W01-029` Reorder level.
- `W01-030` Safety stock.
- `W01-031` Min/max policy.
- `W01-032` Inventory forecast.

## W02 WMS

- `W02-001` Zone.
- `W02-002` Bin/rack/location.
- `W02-003` Putaway rule.
- `W02-004` Putaway task.
- `W02-005` Pick list.
- `W02-006` Wave picking.
- `W02-007` Packing.
- `W02-008` Replenishment.
- `W02-009` Cycle count.
- `W02-010` Barcode.
- `W02-011` QR.
- `W02-012` Mobile scanner.
- `W02-013` Warehouse task assignment.
- `W02-014` Inventory count freeze/snapshot.

---

# L — LOGISTICS & DISTRIBUTION

## L01 Transportation

- `L01-001` Shipment.
- `L01-002` Carrier.
- `L01-003` Vehicle.
- `L01-004` Driver.
- `L01-005` Delivery route.
- `L01-006` Trip.
- `L01-007` Loading plan.
- `L01-008` Proof of Delivery.
- `L01-009` Freight cost.
- `L01-010` Shipping charge.
- `L01-011` Transport contract.
- `L01-012` Delivery tracking.
- `L01-013` Route optimization seam.
- `L01-014` Last-mile delivery.
- `L01-015` Return logistics.
- `L01-016` Cross docking.

---

# M — MANUFACTURING / MRP II

## M01 Product Structure & Routing

- `M01-001` BOM.
- `M01-002` BOM child/components.
- `M01-003` Multi-level BOM.
- `M01-004` BOM version.
- `M01-005` Effective date.
- `M01-006` Alternate BOM.
- `M01-007` Phantom BOM.
- `M01-008` Substitute material.
- `M01-009` Routing.
- `M01-010` Operation.
- `M01-011` Workstation.
- `M01-012` Workstation calendar.

## M02 Planning & Scheduling

- `M02-001` Production Plan.
- `M02-002` Demand forecast.
- `M02-003` MRP explosion.
- `M02-004` Material requirement.
- `M02-005` Make-to-order.
- `M02-006` Make-to-stock.
- `M02-007` Capacity requirement.
- `M02-008` Finite capacity planning.
- `M02-009` Production scheduling.
- `M02-010` Rescheduling.

## M03 Shop Floor

- `M03-001` Work Order.
- `M03-002` Job Card.
- `M03-003` Job time log.
- `M03-004` WIP transfer.
- `M03-005` Material issue to production.
- `M03-006` Material transfer for manufacture.
- `M03-007` Finished Goods receipt.
- `M03-008` Scrap.
- `M03-009` Rework.
- `M03-010` Subcontracting.
- `M03-011` Downtime.
- `M03-012` Labor usage.
- `M03-013` Machine utilization.
- `M03-014` Production completion guards.

## M04 Manufacturing Cost & Traceability

- `M04-001` Material cost.
- `M04-002` Labor cost.
- `M04-003` Machine cost.
- `M04-004` Overhead.
- `M04-005` Standard manufacturing cost.
- `M04-006` Actual manufacturing cost.
- `M04-007` Manufacturing variance.
- `M04-008` Lot genealogy.
- `M04-009` Raw-to-FG traceability.
- `M04-010` FG-to-customer traceability.

---

# Q — QUALITY MANAGEMENT

## Q01 QMS

- `Q01-001` Quality Plan.
- `Q01-002` Inspection template.
- `Q01-003` Incoming inspection.
- `Q01-004` In-process inspection.
- `Q01-005` Final inspection.
- `Q01-006` Sampling plan.
- `Q01-007` Quality readings.
- `Q01-008` Non-Conformance/NCR.
- `Q01-009` Root Cause Analysis.
- `Q01-010` Corrective Action.
- `Q01-011` Preventive Action.
- `Q01-012` CAPA.
- `Q01-013` Supplier quality.
- `Q01-014` Customer complaint quality flow.
- `Q01-015` Calibration.
- `Q01-016` Quality KPI.

---

# E — EQUIPMENT, MAINTENANCE & ASSETS

## E01 CMMS / Maintenance

- `E01-001` Equipment/machine master.
- `E01-002` Preventive maintenance plan.
- `E01-003` Maintenance schedule.
- `E01-004` Maintenance request.
- `E01-005` Breakdown.
- `E01-006` Maintenance Work Order.
- `E01-007` Technician assignment.
- `E01-008` Spare parts consumption.
- `E01-009` Meter reading.
- `E01-010` Inspection/checklist.
- `E01-011` Downtime.
- `E01-012` MTBF.
- `E01-013` MTTR.
- `E01-014` Maintenance cost.
- `E01-015` Service history.
- `E01-016` Equipment warranty.

## E02 Fixed Assets / EAM

- `E02-001` Asset category.
- `E02-002` Asset acquisition.
- `E02-003` Capitalization.
- `E02-004` Asset register.
- `E02-005` Location.
- `E02-006` Custodian.
- `E02-007` Asset movement.
- `E02-008` Depreciation method.
- `E02-009` Depreciation schedule.
- `E02-010` Depreciation posting.
- `E02-011` Revaluation.
- `E02-012` Impairment.
- `E02-013` Asset maintenance integration.
- `E02-014` Asset audit.
- `E02-015` Insurance.
- `E02-016` Disposal/sale.
- `E02-017` Scrap.
- `E02-018` Gain/loss on disposal.

---

# H — HUMAN CAPITAL MANAGEMENT

## H01 Organization & Workforce

- `H01-001` Company.
- `H01-002` Branch.
- `H01-003` Department.
- `H01-004` Designation.
- `H01-005` Employment Type.
- `H01-006` Organization chart.
- `H01-007` Position/headcount plan.
- `H01-008` Manpower budget.

## H02 Recruitment / ATS

- `H02-001` Job Opening.
- `H02-002` Career posting.
- `H02-003` Job Applicant.
- `H02-004` Candidate pool.
- `H02-005` CV extraction/parser.
- `H02-006` Candidate matching.
- `H02-007` Interview.
- `H02-008` Interview scorecard.
- `H02-009` Job Offer.
- `H02-010` Offer acceptance/rejection.
- `H02-011` Recruitment funnel analytics.

## H03 Employee Lifecycle

- `H03-001` Employee.
- `H03-002` Employment Contract.
- `H03-003` Onboarding.
- `H03-004` Employee Transfer.
- `H03-005` Promotion.
- `H03-006` Discipline.
- `H03-007` Personnel document.
- `H03-008` Document expiry/renewal.
- `H03-009` Separation/offboarding.
- `H03-010` Employee self-service.

## H04 Time, Leave & Attendance

- `H04-001` Holiday List.
- `H04-002` Leave Type.
- `H04-003` Leave Policy.
- `H04-004` Leave Allocation.
- `H04-005` Leave Application.
- `H04-006` Leave approval.
- `H04-007` Shift Type.
- `H04-008` Shift Assignment/roster.
- `H04-009` Employee Checkin.
- `H04-010` Geofence/mobile checkin.
- `H04-011` Attendance.
- `H04-012` Attendance adjustment.
- `H04-013` Overtime request.
- `H04-014` Overtime rule.
- `H04-015` Timesheet.

## H05 Payroll, Benefits & Employee Finance

- `H05-001` Salary Component.
- `H05-002` Salary Structure.
- `H05-003` Salary Structure Assignment.
- `H05-004` Payroll Period.
- `H05-005` Additional Salary.
- `H05-006` Salary Slip.
- `H05-007` Payroll Entry.
- `H05-008` Attendance/leave/OT payroll input.
- `H05-009` Benefits.
- `H05-010` Employee loan.
- `H05-011` Employee Advance.
- `H05-012` Expense Claim.
- `H05-013` Travel Request.
- `H05-014` PIT engine integration.
- `H05-015` BHXH engine integration.
- `H05-016` Payroll GL posting.
- `H05-017` Bank salary transfer.
- `H05-018` Payslip portal.

## H06 Performance, Talent & Learning

- `H06-001` Goal.
- `H06-002` KPI.
- `H06-003` OKR.
- `H06-004` Appraisal.
- `H06-005` 360 review.
- `H06-006` Competency framework.
- `H06-007` Talent pool.
- `H06-008` Succession plan.
- `H06-009` Training Event.
- `H06-010` Course/curriculum.
- `H06-011` Exam/assessment.
- `H06-012` Certificate.
- `H06-013` LMS portal.

---

# J — PROJECTS / PSA / CONSTRUCTION

## J01 Project Management

- `J01-001` Project portfolio.
- `J01-002` Project.
- `J01-003` Project template.
- `J01-004` WBS.
- `J01-005` Task.
- `J01-006` Task dependency.
- `J01-007` Gantt.
- `J01-008` Milestone.
- `J01-009` Resource allocation.
- `J01-010` Capacity planning.
- `J01-011` Project timesheet.
- `J01-012` Project expense.
- `J01-013` Project procurement.
- `J01-014` Project inventory.
- `J01-015` Project budget.
- `J01-016` Project cost.
- `J01-017` Project billing.
- `J01-018` Project profitability.
- `J01-019` Project cash flow.
- `J01-020` Earned value.
- `J01-021` Retention.
- `J01-022` Change Order.
- `J01-023` Progress/acceptance certificate.

---

# S — SERVICE, HELPDESK & FIELD SERVICE

## S01 Helpdesk / Customer Service

- `S01-001` Ticket/Issue.
- `S01-002` Queue/team.
- `S01-003` Assignment.
- `S01-004` SLA.
- `S01-005` SLA calendar.
- `S01-006` Escalation.
- `S01-007` Email-to-ticket.
- `S01-008` Chat/social-to-ticket.
- `S01-009` Knowledge Base.
- `S01-010` Canned response.
- `S01-011` Customer portal.
- `S01-012` CSAT.
- `S01-013` Warranty Claim.
- `S01-014` Service Contract.
- `S01-015` Maintenance Contract.

## S02 Field Service

- `S02-001` Service Order.
- `S02-002` Technician.
- `S02-003` Schedule.
- `S02-004` Dispatch.
- `S02-005` Map/GPS.
- `S02-006` Route.
- `S02-007` Offline mobile.
- `S02-008` Spare parts.
- `S02-009` Checklist.
- `S02-010` Photo evidence.
- `S02-011` Customer signature.
- `S02-012` Service report.
- `S02-013` Service billing.

---

# R — RETAIL, POS & COMMERCE

## R01 POS / Retail

- `R01-001` POS profile/store.
- `R01-002` POS opening/session.
- `R01-003` Cashier.
- `R01-004` Barcode sale.
- `R01-005` POS Invoice.
- `R01-006` Receipt.
- `R01-007` Discount.
- `R01-008` Promotion.
- `R01-009` Loyalty.
- `R01-010` Gift card/store credit.
- `R01-011` Refund.
- `R01-012` Exchange.
- `R01-013` Multi-store.
- `R01-014` Offline POS.
- `R01-015` Cash closing.
- `R01-016` POS e-invoice.
- `R01-017` Retail analytics.

## R02 E-commerce & Omnichannel

- `R02-001` Product catalog.
- `R02-002` Product variant.
- `R02-003` Public price.
- `R02-004` Cart.
- `R02-005` Checkout.
- `R02-006` Payment gateway.
- `R02-007` Shipping method.
- `R02-008` Order tracking.
- `R02-009` Marketplace order ingestion.
- `R02-010` Omnichannel inventory.
- `R02-011` Omnichannel price.
- `R02-012` Omnichannel customer.
- `R02-013` Facebook commerce.
- `R02-014` Zalo commerce.
- `R02-015` TikTok Shop connector.
- `R02-016` Shopee connector.
- `R02-017` Lazada connector.
- `R02-018` Social inbox.
- `R02-019` Campaign attribution.

---

# D — DIGITAL WORKPLACE, DOCUMENTS & CONTRACTS

## D01 Digital Workplace

- `D01-001` Personal task.
- `D01-002` Team task.
- `D01-003` Kanban.
- `D01-004` Calendar.
- `D01-005` Meeting.
- `D01-006` Meeting minutes.
- `D01-007` Internal request.
- `D01-008` Announcement.
- `D01-009` Internal news.
- `D01-010` Employee directory.
- `D01-011` Discussion.
- `D01-012` Approval inbox.
- `D01-013` Reminder.
- `D01-014` Delegation.
- `D01-015` Recurring work.
- `D01-016` Work report.

## D02 Document Management

- `D02-001` File manager.
- `D02-002` Folder.
- `D02-003` File metadata.
- `D02-004` File version.
- `D02-005` OCR.
- `D02-006` Full-text search.
- `D02-007` Document permission.
- `D02-008` Document approval.
- `D02-009` Template.
- `D02-010` Retention policy.
- `D02-011` Archive.
- `D02-012` Expiry.
- `D02-013` Digital signature.

## D03 Contract Lifecycle Management

- `D03-001` Customer contract.
- `D03-002` Supplier contract.
- `D03-003` Employee contract.
- `D03-004` Service contract.
- `D03-005` Effective date.
- `D03-006` Expiry.
- `D03-007` Renewal.
- `D03-008` Terms.
- `D03-009` Obligation.
- `D03-010` SLA.
- `D03-011` Contract value.
- `D03-012` Amendment.
- `D03-013` E-signature.

---

# B — BPM, LOW-CODE & APP FACTORY

## B01 Workflow / BPM

- `B01-001` Workflow definition.
- `B01-002` Workflow state.
- `B01-003` Workflow transition.
- `B01-004` Sequential approval.
- `B01-005` Parallel approval.
- `B01-006` Approval matrix.
- `B01-007` Conditional routing.
- `B01-008` Delegation.
- `B01-009` Escalation.
- `B01-010` SLA/timer.
- `B01-011` Scheduled action.
- `B01-012` Event trigger.
- `B01-013` Business rule.
- `B01-014` Formula/calculation rule.
- `B01-015` Webhook/external action.
- `B01-016` Process analytics.
- `B01-017` Bottleneck analysis.
- `B01-018` Visual workflow builder.

## B02 App Factory

- `B02-001` App manifest.
- `B02-002` App dependency.
- `B02-003` App version.
- `B02-004` App install.
- `B02-005` App upgrade.
- `B02-006` App rollback.
- `B02-007` App catalog/marketplace.
- `B02-008` DocType builder.
- `B02-009` Field builder.
- `B02-010` Child Table builder.
- `B02-011` Form builder.
- `B02-012` List builder.
- `B02-013` Workflow builder.
- `B02-014` Rule builder.
- `B02-015` Formula builder.
- `B02-016` Action builder.
- `B02-017` Report builder.
- `B02-018` Dashboard builder.
- `B02-019` Print builder.
- `B02-020` Role builder.
- `B02-021` Permission builder.
- `B02-022` Preview/test app.
- `B02-023` Package export/import.

---

# A — ANALYTICS & AI

## A01 BI / Semantic Layer

- `A01-001` Metric definition.
- `A01-002` Dimension definition.
- `A01-003` Measure definition.
- `A01-004` Permission-aware semantic query.
- `A01-005` KPI card.
- `A01-006` Chart builder.
- `A01-007` Pivot.
- `A01-008` Query report.
- `A01-009` Dashboard.
- `A01-010` Drill-down.
- `A01-011` Drill-through.
- `A01-012` Saved filter/view.
- `A01-013` Scheduled report.
- `A01-014` Report subscription.
- `A01-015` Excel export.
- `A01-016` PDF export.
- `A01-017` Forecast.
- `A01-018` Scenario planning.
- `A01-019` Executive cockpit.
- `A01-020` Data warehouse feed.

## A02 AI Platform

- `A02-001` General assistant.
- `A02-002` Context assistant.
- `A02-003` AI search.
- `A02-004` Natural-language report query.
- `A02-005` Natural-language filter.
- `A02-006` Natural-language dashboard request.
- `A02-007` Document summary.
- `A02-008` OCR/document extraction.
- `A02-009` Invoice extraction.
- `A02-010` CV extraction.
- `A02-011` Entity matching.
- `A02-012` Forecasting.
- `A02-013` Anomaly detection.
- `A02-014` Duplicate detection.
- `A02-015` Recommendation.
- `A02-016` Email drafting.
- `A02-017` Customer reply drafting.
- `A02-018` Purchase recommendation.
- `A02-019` Stock recommendation.
- `A02-020` Production recommendation.
- `A02-021` AI action proposal.
- `A02-022` Tool execution with permission.
- `A02-023` Preview before write.
- `A02-024` Human approval gate.
- `A02-025` AI audit log.

---

# I — INTEGRATION PLATFORM & ECOSYSTEM

## I01 Integration Foundation

- `I01-001` REST API.
- `I01-002` API key.
- `I01-003` OAuth.
- `I01-004` Service account.
- `I01-005` Webhook.
- `I01-006` Event subscription.
- `I01-007` Connector SDK.
- `I01-008` Mapping/transformation.
- `I01-009` Import API.
- `I01-010` Export API.
- `I01-011` Queue.
- `I01-012` Retry.
- `I01-013` Dead-letter.
- `I01-014` Idempotency.
- `I01-015` Connector audit.

## I02 Business Connectors

- `I02-001` Bank connector framework.
- `I02-002` E-invoice connector.
- `I02-003` Tax connector.
- `I02-004` BHXH connector.
- `I02-005` Payment gateway.
- `I02-006` Shipping carrier.
- `I02-007` E-sign provider.
- `I02-008` Email provider.
- `I02-009` SMS provider.
- `I02-010` Zalo.
- `I02-011` Facebook.
- `I02-012` Google Workspace.
- `I02-013` Microsoft 365.
- `I02-014` Shopee.
- `I02-015` Lazada.
- `I02-016` TikTok Shop.

---

# G — GOVERNANCE, SECURITY & IDENTITY

## G01 Identity & Access

- `G01-001` User.
- `G01-002` Role.
- `G01-003` RBAC.
- `G01-004` Record permission.
- `G01-005` Field/permlevel permission.
- `G01-006` Owner permission.
- `G01-007` Share.
- `G01-008` User Permission/scope.
- `G01-009` Approval authority.
- `G01-010` Segregation of Duties.
- `G01-011` MFA.
- `G01-012` OIDC.
- `G01-013` SAML.
- `G01-014` SSO.
- `G01-015` SCIM.
- `G01-016` Session management.
- `G01-017` Device/session revocation.
- `G01-018` IP/network policy.

## G02 Governance & Privacy

- `G02-001` Audit trail.
- `G02-002` Immutable audit evidence.
- `G02-003` PII classification.
- `G02-004` Data masking.
- `G02-005` Data retention.
- `G02-006` Consent.
- `G02-007` Privileged action audit.
- `G02-008` Security alerts.
- `G02-009` Export/access audit.

---

# T — TENANT / SAAS CONTROL PLANE

## T01 SaaS Lifecycle

- `T01-001` Signup/onboarding.
- `T01-002` Tenant provisioning.
- `T01-003` Domain/subdomain.
- `T01-004` Tenant routing.
- `T01-005` Plan.
- `T01-006` Subscription.
- `T01-007` Billing.
- `T01-008` Usage metering.
- `T01-009` Quota.
- `T01-010` Feature flags.
- `T01-011` Module enable/disable.
- `T01-012` App install per tenant.
- `T01-013` App upgrade per tenant.
- `T01-014` App rollback.
- `T01-015` Tenant migration.
- `T01-016` Backup.
- `T01-017` Restore.
- `T01-018` Suspend/reactivate.
- `T01-019` Delete tenant/data lifecycle.
- `T01-020` Audited support access/impersonation.

---

# O — OBSERVABILITY, RELIABILITY & OPERATIONS

## O01 SRE

- `O01-001` Health check.
- `O01-002` Release marker.
- `O01-003` Metrics.
- `O01-004` Structured logs.
- `O01-005` Distributed trace/correlation ID.
- `O01-006` Alerts.
- `O01-007` Error tracking.
- `O01-008` Queue monitoring.
- `O01-009` Retry visibility.
- `O01-010` Dead-letter recovery.
- `O01-011` Integrity checks.
- `O01-012` Ledger reconciliation jobs.
- `O01-013` Backup verification.
- `O01-014` Point-in-time restore strategy.
- `O01-015` Disaster recovery.
- `O01-016` Release rollback.
- `O01-017` Migration verification.
- `O01-018` Performance test.
- `O01-019` Load test.
- `O01-020` Rate limit.
- `O01-021` Abuse protection.

---

# X — DEVELOPER PLATFORM

## X01 Developer Experience

- `X01-001` CLI.
- `X01-002` SDK.
- `X01-003` Local development environment.
- `X01-004` App generator.
- `X01-005` Schema generator.
- `X01-006` Migration generator.
- `X01-007` Test harness.
- `X01-008` Fixtures.
- `X01-009` Seed/demo data.
- `X01-010` Preview environment.
- `X01-011` API explorer.
- `X01-012` Webhook debugger.
- `X01-013` Plugin/extension SDK.
- `X01-014` Package registry/catalog.
- `X01-015` Compatibility/source-lock tooling.

---

# N — NOTIFICATIONS, COLLABORATION & SEARCH

## N01 Collaboration

- `N01-001` Comment.
- `N01-002` Mention.
- `N01-003` Assignment.
- `N01-004` Follow/watch.
- `N01-005` Share.
- `N01-006` Activity timeline.
- `N01-007` Attachment.
- `N01-008` Tag.
- `N01-009` Checklist.
- `N01-010` Internal discussion.

## N02 Notifications

- `N02-001` In-app notification.
- `N02-002` Email notification.
- `N02-003` SMS notification.
- `N02-004` Zalo notification.
- `N02-005` Web push.
- `N02-006` Mobile push.
- `N02-007` Digest.
- `N02-008` Scheduled reminder.
- `N02-009` Escalation notification.
- `N02-010` Template.
- `N02-011` User notification preferences.
- `N02-012` Delivery log/status.

## N03 Search

- `N03-001` Global Search.
- `N03-002` Full-text search.
- `N03-003` Fuzzy search.
- `N03-004` Recent items.
- `N03-005` Favorites.
- `N03-006` Saved search.
- `N03-007` Permission-aware search.
- `N03-008` Command Palette.
- `N03-009` AI search.

---

# U — MOBILE, OFFLINE & INTERNATIONALIZATION

## U01 Mobile / Offline

- `U01-001` Responsive PWA.
- `U01-002` Installable PWA.
- `U01-003` Offline read/cache.
- `U01-004` Offline write queue.
- `U01-005` Background sync.
- `U01-006` Conflict detection.
- `U01-007` Conflict resolution UX.
- `U01-008` Camera capture.
- `U01-009` Barcode scanner.
- `U01-010` QR scanner.
- `U01-011` GPS/geolocation.
- `U01-012` Signature capture.
- `U01-013` Push notifications.

## U02 Internationalization

- `U02-001` Multiple languages.
- `U02-002` Translation management.
- `U02-003` Locale.
- `U02-004` Number format.
- `U02-005` Date/time format.
- `U02-006` Timezone.
- `U02-007` Currency.
- `U02-008` Exchange rates.
- `U02-009` Fiscal calendar.
- `U02-010` Country pack.
- `U02-011` Tax pack.
- `U02-012` Local Chart of Accounts.

---

# MD — MASTER DATA & DATA GOVERNANCE

## MD01 Master Data Management

- `MD01-001` Company master.
- `MD01-002` Branch master.
- `MD01-003` Department master.
- `MD01-004` Warehouse master.
- `MD01-005` Item master.
- `MD01-006` Customer master.
- `MD01-007` Supplier master.
- `MD01-008` Employee master.
- `MD01-009` Account master.
- `MD01-010` Cost Center master.
- `MD01-011` Project master.
- `MD01-012` UOM master.
- `MD01-013` Currency master.
- `MD01-014` Tax master.
- `MD01-015` Address.
- `MD01-016` Contact.
- `MD01-017` Duplicate detection.
- `MD01-018` Merge.
- `MD01-019` Data owner/steward.
- `MD01-020` Master approval.
- `MD01-021` Effective dating.

## MD02 Data Governance

- `MD02-001` Data catalog.
- `MD02-002` Data lineage.
- `MD02-003` Data quality rule.
- `MD02-004` Validation dashboard.
- `MD02-005` Cross-ledger reconciliation.
- `MD02-006` Historical snapshot.
- `MD02-007` Audit dataset.
- `MD02-008` Archive/export.
- `MD02-009` Data warehouse feed.
- `MD02-010` Change Data Capture seam.

---

# IM — IMPLEMENTATION, MIGRATION & CUSTOMER SUCCESS

## IM01 Setup & Implementation

- `IM01-001` Setup Wizard.
- `IM01-002` Company setup.
- `IM01-003` Accounting setup.
- `IM01-004` Warehouse setup.
- `IM01-005` HR setup.
- `IM01-006` Tax/localization setup.
- `IM01-007` Guided tour.
- `IM01-008` Implementation checklist.
- `IM01-009` Go-live checklist.
- `IM01-010` Demo/seed data.
- `IM01-011` Training content.
- `IM01-012` Help Center.
- `IM01-013` Knowledge Base.
- `IM01-014` Customer support flow.
- `IM01-015` Adoption analytics.

## IM02 Import & Migration

- `IM02-001` CSV import.
- `IM02-002` Excel import.
- `IM02-003` Mapping wizard.
- `IM02-004` Validation preview.
- `IM02-005` Duplicate handling.
- `IM02-006` Error correction/retry.
- `IM02-007` Opening balance import.
- `IM02-008` Incremental migration.
- `IM02-009` Post-migration reconciliation.
- `IM02-010` Excel -> Forge template.
- `IM02-011` MISA -> Forge adapter.
- `IM02-012` ERPNext -> Forge adapter.
- `IM02-013` Odoo -> Forge adapter.
- `IM02-014` FAST -> Forge adapter.
- `IM02-015` Bravo -> Forge adapter.
- `IM02-016` Legacy SQL/API migration.

---

# VP — VERTICAL / INDUSTRY PACKS

## VP01 Alumdoor / Aluminum & Doors

- `VP01-001` Aluminum/item profile master.
- `VP01-002` Dimensions/weight/barem.
- `VP01-003` Door formula/configuration.
- `VP01-004` Cutting optimization/plan.
- `VP01-005` Sales-to-production linkage.
- `VP01-006` Material reservation.
- `VP01-007` Supplier order/debt/FIFO allocation.
- `VP01-008` Supplier delivery reconciliation.
- `VP01-009` Physical stock/catch-weight where applicable.
- `VP01-010` Production completion.
- `VP01-011` Delivery/invoice/debt.
- `VP01-012` Warranty/defect.
- `VP01-013` Warehouse cash.
- `VP01-014` OCR/document capture.
- `VP01-015` Daily detailed ledger/reconciliation.

## VP02 Candidate Vertical Packs

- `VP02-001` Distribution.
- `VP02-002` Retail/F&B.
- `VP02-003` Construction.
- `VP02-004` Logistics.
- `VP02-005` Agriculture.
- `VP02-006` Professional Services.
- `VP02-007` Maintenance Services.
- `VP02-008` Hospitality.
- `VP02-009` Education.
- `VP02-010` Real Estate.
- `VP02-011` Automotive.
- `VP02-012` Healthcare only with domain/compliance review.

---

# Completion policy

Một PR không cần đóng cả domain. Nó phải đóng **một slice rõ ràng** và tham chiếu capability IDs.

Ví dụ:

```text
Capabilities: P01-003, P01-004, P01-005, P01-006
Slice: RFQ -> Supplier Quotation -> Comparison -> Approval
Risk: STANDARD
Evidence: controller tests + permission tests + browser flow
```

Khi một capability đạt RC/Hardened, evidence tối thiểu phải chỉ ra:

- source implementation;
- tests/regression;
- migration nếu có;
- permission/tenant checks;
- correction/reversal nếu liên quan;
- UI/E2E nếu có UI;
- reconciliation nếu ảnh hưởng finance/stock/payroll;
- production release evidence nếu claim deployed.

Capability map này là **mẫu số** để đo coverage lâu dài. `CURRENT_STATUS.md` mới là nơi nói Forge hôm nay đang ở đâu.