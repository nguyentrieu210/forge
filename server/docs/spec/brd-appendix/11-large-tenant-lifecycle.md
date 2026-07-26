# Large Tenant Lifecycle

Tenant được phân lớp theo dữ liệu, throughput và compliance, không chỉ theo số user.

| Class | Physical model | Trigger |
|---|---|---|
| S | 1 D1 + shared R2 | tenant mới/nhỏ |
| M | 1 primary D1 + dedicated R2 prefix/bucket + read replication | read-heavy hoặc compliance |
| L | primary D1 + fiscal-year ledger D1 + archive D1 | >75% capacity hoặc write hotspot |
| XL | dedicated deployment/account strategy, multiple services/shards | benchmark chứng minh D1 đơn không phù hợp |

CloudForge không ép tenant XL vào D1 nếu workload vượt giới hạn đã đo. Platform Adapter giữ frontend/business contract, còn physical store có thể chuyển sang backend phù hợp qua migration có oracle.
