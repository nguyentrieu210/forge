from __future__ import annotations

from hashlib import sha256

from frappe.model.document import Document


class AlumdoorRequestKey(Document):
	def autoname(self):
		identity = f"{self.user}\x1f{self.action}\x1f{self.idempotency_key}"
		self.name = "REQ-" + sha256(identity.encode("utf-8")).hexdigest()
