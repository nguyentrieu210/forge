/** @metaforge/ui — design system (shadcn/ui + Radix + Tailwind v4 tokens). */
export { cn } from "./lib/cn.js";

export { Button, buttonVariants, SplitButton, SplitButtonCaret, type ButtonProps } from "./components/ui/button.js";
/** Style dùng chung cho control tự dựng ngoài kit (giữ focus/kích thước đồng bộ với Input/Select). */
export { focusRing, controlBase } from "./components/ui/control-styles.js";
export { FileButton, type FileButtonProps } from "./components/ui/file-button.js";
export { Input } from "./components/ui/input.js";
export { Textarea } from "./components/ui/textarea.js";
export { Label } from "./components/ui/label.js";
export { Badge, badgeVariants, StatusBadge, type BadgeProps, type StatusTone } from "./components/ui/badge.js";
export { Skeleton } from "./components/ui/skeleton.js";
export { Separator } from "./components/ui/separator.js";
export { Avatar, AvatarImage, AvatarFallback } from "./components/ui/avatar.js";
export { Checkbox } from "./components/ui/checkbox.js";
export { Switch } from "./components/ui/switch.js";
export {
  Dialog, DialogTrigger, DialogPortal, DialogClose, DialogOverlay, DialogContent,
  DialogHeader, DialogTitle, DialogDescription,
} from "./components/ui/dialog.js";
export { ConfirmDialog, type ConfirmDialogProps } from "./components/ui/confirm-dialog.js";
export { PromptDialog, type PromptDialogProps } from "./components/ui/prompt-dialog.js";
export {
  Popover, PopoverTrigger, PopoverAnchor, PopoverContent,
  canConsumeScrollDelta, resolvePopoverModal,
} from "./components/ui/popover.js";
export {
  Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup,
  CommandItem, CommandSeparator, CommandShortcut,
} from "./components/ui/command.js";
export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub,
  DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
} from "./components/ui/dropdown-menu.js";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs.js";
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./components/ui/tooltip.js";
export { ScrollArea } from "./components/ui/scroll-area.js";
export {
  Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle,
} from "./components/ui/sheet.js";
export {
  Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell,
} from "./components/ui/table.js";
export {
  Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectItem,
} from "./components/ui/select.js";
export { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./components/ui/resizable.js";
export { Toaster, toast } from "./components/ui/sonner.js";
export { I18nProvider, useI18n, useT, useLocale, type Locale } from "./i18n/index.js";

export const UI_VERSION = "0.1.0";