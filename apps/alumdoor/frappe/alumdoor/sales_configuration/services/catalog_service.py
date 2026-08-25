from __future__ import annotations

import re
import unicodedata
from typing import Any

import frappe
from frappe import _


GROUP_MARKERS: dict[str, tuple[str, ...]] = {
	"CUA-CN-DUC": ("cn duc", "cua duc"),
	"PHU-KIEN-CN-DUC": ("cn duc", "cua duc", "phu kien can son tinh dien"),
	"CUA-TAM-LIEN-UC": ("tam lien uc", "cua uc", " uc"),
	"CUA-SIEU-TRUONG": ("sieu truong",),
	"CUA-DAI-LOAN": ("dai loan",),
	"CUA-DAI-LOAN-INOX": ("dai loan inox",),
	"CUA-KEO-DAI-LOAN": ("keo dai loan",),
	"CUA-LUOI": ("luoi",),
	"PHU-KIEN": ("phu kien can son tinh dien",),
}

SPECIFIC_COLOR_MARKERS: tuple[tuple[tuple[str, ...], str], ...] = (
	(("xn-vk", "xnvk", "xanh ngoc - vang kem"), "MM-XN-VK"),
	(("xam-trang", "xam - trang"), "MM-XAM-TRANG"),
	(("ghiuc-kemuc", "ghi uc - kem uc"), "MM-GHIUC-KEMUC"),
	(("xanhreu-cafe", "xanh reu - cafe"), "MM-XANHREU-CAFE"),
	(("xn-xlc", "xam-xanhngoc", "xam - xanh ngoc"), "MM-XAM-XANHNGOC"),
)


def _plain(value: Any) -> str:
	text = unicodedata.normalize("NFD", str(value or "").strip().lower())
	text = "".join(char for char in text if unicodedata.category(char) != "Mn")
	return re.sub(r"\s+", " ", text.replace("đ", "d"))


def _expected_finish(item: dict[str, Any]) -> tuple[str | None, str | None]:
	haystack = _plain(f"{item.get('name')} {item.get('item_name')}")
	for markers, color in SPECIFIC_COLOR_MARKERS:
		if any(marker in haystack for marker in markers):
			return "MM", color
	if "van go" in haystack or "van_go" in haystack:
		return "VAN_GO", None
	if "son tinh dien" in haystack or re.search(r"(^|[^a-z])std([^a-z]|$)", haystack):
		return "STD", None
	if "inox" in haystack:
		return None, "__NO_COLOR__"
	return None, None


def _applies_to_group(color: dict[str, Any], item_group: str) -> bool:
	product_scope = _plain(color.get("applicable_products"))
	if not product_scope:
		return False
	markers = GROUP_MARKERS.get(item_group, ())
	return any(marker in product_scope for marker in markers)


def get_allowed_colors(item_code: str) -> list[dict[str, Any]]:
	"""Return only colors that the selected sale item can actually use.

	The item code/name may already pin a finish (STĐ, vân gỗ) or one exact
	mạ-màu combination.  The item group then narrows the color master scope.
	An unknown/unconfigured context intentionally returns no colors.
	"""
	item = frappe.db.get_value(
		"Alumdoor Item",
		item_code,
		["name", "item_name", "item_group", "disabled", "is_sales_item"],
		as_dict=True,
	)
	if not item or item.disabled or not item.is_sales_item:
		frappe.throw(_("Mặt hàng {0} không phải mặt hàng bán đang sử dụng").format(item_code))

	expected_finish, exact_color = _expected_finish(item)
	if exact_color == "__NO_COLOR__":
		return []

	colors = frappe.get_all(
		"Alumdoor Color",
		filters={"enabled": 1},
		fields=["name", "color_code", "color_name", "surface_finish", "applicable_products", "sort_order"],
		order_by="sort_order asc, color_name asc",
		limit_page_length=500,
	)
	allowed: list[dict[str, Any]] = []
	for color in colors:
		haystack = _plain(f"{item.name} {item.item_name}")
		if "al70" in haystack and ("1 lop" in haystack or "1lop" in haystack) and color.name not in {"GS", "VK"}:
			continue
		if exact_color and color.name != exact_color:
			continue
		if expected_finish and color.surface_finish != expected_finish:
			continue
		if not _applies_to_group(color, item.item_group):
			continue
		allowed.append(
			{
				"name": color.name,
				"color_code": color.color_code,
				"color_name": color.color_name,
				"surface_finish": color.surface_finish,
			}
		)
	return allowed


@frappe.whitelist(methods=["GET", "POST"])
def allowed_colors(item_code: str) -> dict[str, Any]:
	colors = get_allowed_colors(item_code)
	return {
		"item_code": item_code,
		"allowed_colors": [row["name"] for row in colors],
		"color_labels": {row["name"]: row["color_name"] for row in colors},
		"colors": colors,
	}


def validate_item_color(item_code: str, color: str | None) -> None:
	allowed = {row["name"] for row in get_allowed_colors(item_code)}
	chosen = str(color or "").strip()
	if chosen and chosen not in allowed:
		frappe.throw(
			_("Màu {0} không được phép dùng cho mặt hàng {1}").format(chosen, item_code),
			frappe.ValidationError,
		)
	if allowed and not chosen:
		frappe.throw(_("Cần chọn màu hợp lệ cho mặt hàng {0}").format(item_code))
