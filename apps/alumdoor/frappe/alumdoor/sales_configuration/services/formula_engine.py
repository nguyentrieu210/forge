from __future__ import annotations

import ast
import math
from collections.abc import Mapping
from typing import Any

import frappe
from frappe import _
from frappe.utils import getdate, nowdate


SAFE_FUNCTIONS = {
	"abs": abs,
	"ceil": math.ceil,
	"floor": math.floor,
	"max": max,
	"min": min,
	"round": round,
}

SAFE_NODES = (
	ast.Expression,
	ast.Constant,
	ast.Name,
	ast.Load,
	ast.BinOp,
	ast.UnaryOp,
	ast.BoolOp,
	ast.Compare,
	ast.IfExp,
	ast.Call,
	ast.Add,
	ast.Sub,
	ast.Mult,
	ast.Div,
	ast.FloorDiv,
	ast.Mod,
	ast.Pow,
	ast.UAdd,
	ast.USub,
	ast.Not,
	ast.And,
	ast.Or,
	ast.Eq,
	ast.NotEq,
	ast.Lt,
	ast.LtE,
	ast.Gt,
	ast.GtE,
)


class UnsafeExpression(frappe.ValidationError):
	pass


def validate_expression(expression: str | None) -> None:
	if not expression:
		return
	try:
		tree = ast.parse(expression, mode="eval")
	except SyntaxError as exc:
		raise UnsafeExpression(_("Invalid formula syntax: {0}").format(exc.msg)) from exc

	for node in ast.walk(tree):
		if not isinstance(node, SAFE_NODES):
			raise UnsafeExpression(_("Formula contains unsupported syntax: {0}").format(type(node).__name__))
		if isinstance(node, ast.Call):
			if not isinstance(node.func, ast.Name) or node.func.id not in SAFE_FUNCTIONS:
				raise UnsafeExpression(_("Formula function is not allowed"))
			if node.keywords:
				raise UnsafeExpression(_("Keyword arguments are not allowed in formulas"))


def safe_eval(expression: str, context: Mapping[str, Any]) -> Any:
	validate_expression(expression)
	tree = ast.parse(expression, mode="eval")
	return _evaluate(tree.body, context)


def _evaluate(node: ast.AST, context: Mapping[str, Any]) -> Any:
	if isinstance(node, ast.Constant):
		return node.value
	if isinstance(node, ast.Name):
		if node.id not in context:
			raise UnsafeExpression(_("Unknown formula variable: {0}").format(node.id))
		return context[node.id]
	if isinstance(node, ast.BinOp):
		left = _evaluate(node.left, context)
		right = _evaluate(node.right, context)
		operations = {
			ast.Add: lambda: left + right,
			ast.Sub: lambda: left - right,
			ast.Mult: lambda: left * right,
			ast.Div: lambda: left / right,
			ast.FloorDiv: lambda: left // right,
			ast.Mod: lambda: left % right,
			ast.Pow: lambda: left**right,
		}
		operation = operations.get(type(node.op))
		if not operation:
			raise UnsafeExpression(_("Unsupported arithmetic operator"))
		return operation()
	if isinstance(node, ast.UnaryOp):
		value = _evaluate(node.operand, context)
		if isinstance(node.op, ast.UAdd):
			return +value
		if isinstance(node.op, ast.USub):
			return -value
		if isinstance(node.op, ast.Not):
			return not value
	if isinstance(node, ast.BoolOp):
		values = [_evaluate(value, context) for value in node.values]
		return all(values) if isinstance(node.op, ast.And) else any(values)
	if isinstance(node, ast.Compare):
		left = _evaluate(node.left, context)
		for operator, comparator in zip(node.ops, node.comparators, strict=True):
			right = _evaluate(comparator, context)
			if not _compare(left, operator, right):
				return False
			left = right
		return True
	if isinstance(node, ast.IfExp):
		branch = node.body if _evaluate(node.test, context) else node.orelse
		return _evaluate(branch, context)
	if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
		function = SAFE_FUNCTIONS[node.func.id]
		return function(*[_evaluate(argument, context) for argument in node.args])
	raise UnsafeExpression(_("Unsupported formula expression"))


def _compare(left: Any, operator: ast.cmpop, right: Any) -> bool:
	comparisons = {
		ast.Eq: lambda: left == right,
		ast.NotEq: lambda: left != right,
		ast.Lt: lambda: left < right,
		ast.LtE: lambda: left <= right,
		ast.Gt: lambda: left > right,
		ast.GtE: lambda: left >= right,
	}
	comparison = comparisons.get(type(operator))
	if not comparison:
		raise UnsafeExpression(_("Unsupported comparison operator"))
	return comparison()


def evaluate_door_formula(formula_name: str | None, inputs: Mapping[str, Any]) -> dict[str, Any]:
	context = dict(inputs)
	if not formula_name:
		return context

	formula = frappe.get_doc("Door Formula", formula_name)
	if not formula.enabled:
		frappe.throw(_("Door Formula {0} is disabled").format(formula_name))
	today = getdate(nowdate())
	if formula.effective_from and getdate(formula.effective_from) > today:
		frappe.throw(_("Door Formula {0} is not effective yet").format(formula_name))
	if formula.effective_to and getdate(formula.effective_to) < today:
		frappe.throw(_("Door Formula {0} has expired").format(formula_name))

	for variable in sorted(formula.variables, key=lambda row: (row.sequence or 0, row.idx)):
		context[variable.variable_name] = safe_eval(variable.expression, context)
	return context
