# Field Ledger — MetaForge/CloudForge

| Fieldtype | Control | Meta source | Value model | Validation/state | Permission | Form adapter | Mobile | Tests |
|---|---|---|---|---|---|---|---|---|
| Data | TextInput | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Small Text | Textarea | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Long Text | Textarea | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Text Editor | RichText | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Markdown Editor | Markdown | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Code | CodeEditor | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Read Only | ReadOnly | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Int | NumberInput | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Float | NumberInput | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Currency | MoneyInput | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Percent | PercentInput | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Check | Checkbox | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Select | SelectEnum | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Link | LinkField | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Dynamic Link | DynamicLink | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Date | DatePicker | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Datetime | DateTimePicker | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Time | TimePicker | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Duration | DurationInput | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Attach | FileUpload | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Attach Image | ImageUpload | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Signature | SignaturePad | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Color | ColorPicker | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Barcode | BarcodeScanner | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Geolocation | GeoPicker | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Rating | Rating | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Icon | IconPicker | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| HTML | HtmlBlock | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Button | ActionButton | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Table | ChildGrid | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Table MultiSelect | MultiLinkGrid | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Section Break | Section | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Column Break | Column | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Tab Break | Tab | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Heading | Heading | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Image | ImageBlock | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| JSON | JsonEditor | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Password | PasswordInput | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Autocomplete | Autocomplete | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
| Phone | PhoneInput | DocFieldMeta | typed value/nullable | reqd/read_only/hidden/depends | field read/write/mask | RHF/Zod adapter | mobile-native where possible | unit+e2e+visual |
