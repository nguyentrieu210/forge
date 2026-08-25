app_name = "alumdoor"
app_title = "Alumdoor"
app_publisher = "Alumdoor"
app_description = "Quan ly xuong nhom Alumdoor"
app_email = "admin@example.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "alumdoor",
# 		"logo": "/assets/alumdoor/logo.png",
# 		"title": "Alumdoor",
# 		"route": "/alumdoor",
# 		"has_permission": "alumdoor.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/alumdoor/css/alumdoor.css"
# app_include_js = "/assets/alumdoor/js/alumdoor.js"

# include js, css files in header of web template
# web_include_css = "/assets/alumdoor/css/alumdoor.css"
# web_include_js = "/assets/alumdoor/js/alumdoor.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "alumdoor/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "alumdoor/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "alumdoor.utils.jinja_methods",
# 	"filters": "alumdoor.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "alumdoor.install.before_install"
# after_install = "alumdoor.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "alumdoor.uninstall.before_uninstall"
# after_uninstall = "alumdoor.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "alumdoor.utils.before_app_install"
# after_app_install = "alumdoor.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "alumdoor.utils.before_app_uninstall"
# after_app_uninstall = "alumdoor.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "alumdoor.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "alumdoor.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"alumdoor.tasks.all"
# 	],
# 	"daily": [
# 		"alumdoor.tasks.daily"
# 	],
# 	"hourly": [
# 		"alumdoor.tasks.hourly"
# 	],
# 	"weekly": [
# 		"alumdoor.tasks.weekly"
# 	],
# 	"monthly": [
# 		"alumdoor.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "alumdoor.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "alumdoor.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "alumdoor.event.get_events"
# }
override_whitelisted_methods = {
	"metaforge.api.get_boot": "alumdoor.api.get_boot",
	"metaforge.api.get_app_manifest": "alumdoor.api.get_app_manifest",
	"metaforge.api.get_application_catalog": "alumdoor.api.get_application_catalog",
	"metaforge.api.get_business_context": "alumdoor.api.get_business_context",
	"metaforge.api.get_overview": "alumdoor.api.get_overview",
	"metaforge.api.get_capabilities": "alumdoor.api.get_capabilities",
	"metaforge.api.get_contextual_list": "alumdoor.api.get_contextual_list",
	"metaforge.api.get_contextual_count": "alumdoor.api.get_contextual_count",
	"metaforge.api.get_list_view": "alumdoor.api.get_list_view",
	"metaforge.api.global_search": "alumdoor.api.global_search",
	"metaforge.api.resolve_display_values": "alumdoor.api.resolve_display_values",
	"metaforge.api.translate_strings": "alumdoor.api.translate_strings",
	"metaforge.api.get_workflow_transitions": "alumdoor.api.get_workflow_transitions",
	"metaforge.api.get_print_formats": "alumdoor.api.get_print_formats",
}
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "alumdoor.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["alumdoor.utils.before_request"]
# after_request = ["alumdoor.utils.after_request"]

# Job Events
# ----------
# before_job = ["alumdoor.utils.before_job"]
# after_job = ["alumdoor.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"alumdoor.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []
